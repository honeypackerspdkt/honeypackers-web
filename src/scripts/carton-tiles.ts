/**
 * Swaps every tile's drawn box (`svg[data-carton]`: home promos, category tiles, product cards, also those the shop
 * adds later) for a picture of the 3D carton (lib/carton3d.ts), when it comes near the screen. three.js is loaded
 * only once a tile needs it; without WebGL the drawn box stays.
 */
const SEL = 'svg[data-carton]:not([data-carton-done])';
type Carton3d = typeof import('../lib/carton3d');
let lib: Promise<Carton3d> | null = null;

const swap = async (svg: SVGSVGElement) => {
  svg.setAttribute('data-carton-done', '');
  const [l, w, h, yaw, pitch] = (svg.getAttribute('data-carton') || '').split(',').map(Number);
  if (![l, w, h, yaw, pitch].every(Number.isFinite) || !(l > 0 && w > 0 && h > 0)) return void svg.setAttribute('data-carton-ready', '');
  lib ??= import('../lib/carton3d');
  try {
    const url = await (await lib).snapshot({ length: l, width: w, height: h }, { yaw, pitch });
    if (url) svg.innerHTML = `<image href="${url}" x="0" y="0" width="360" height="290"/>`;
  } finally {
    svg.setAttribute('data-carton-ready', ''); // shows the picture, or the drawn box if 3D failed
  }
};

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      swap(e.target as SVGSVGElement).catch((err) => console.warn('[carton] keeping the drawn box', err));
    }
  },
  { rootMargin: '800px 0px' },
);

// no WebGL: show the drawn boxes straight away
const gl = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();
if (!gl) document.documentElement.classList.remove('gl-on', 'gl-wait');

const scan = (root: ParentNode = document) => root.querySelectorAll<SVGSVGElement>(SEL).forEach((s) => io.observe(s));
scan();
new MutationObserver((list) => {
  for (const m of list) for (const n of m.addedNodes) if (n instanceof Element) (n.matches(SEL) ? io.observe(n) : scan(n));
}).observe(document.body, { childList: true, subtree: true });
