import { Group, PerspectiveCamera, Scene } from 'three';
import { buildCarton, canvasTexture, lightScene, makeRenderer, palette, printLayer, rnd, shadowFloor, webglOk } from '../lib/carton3d';

/**
 * The home page carton (hero, and the copy that follows you down the page) as a real 3D object, using the site's
 * shared carton (lib/carton3d.ts) with the Honey Packers print. Owner's choice for a more realistic box (11 Nov 2026).
 * The CSS carton (.cbox) stays in the page: home.ts keeps animating its custom properties (--ry --rx --rz --zoom --lid)
 * and this scene copies them every frame, so the scroll story is unchanged. The CSS carton is hidden once the
 * 3D one has drawn; without WebGL nothing changes.
 */
export async function mountHero3d(stage: HTMLElement, cssBox: HTMLElement): Promise<void> {
  if (!webglOk()) return;
  await document.fonts?.ready;

  const W = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bw')) || 340;
  const H = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bh')) || 250;
  const D = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bd')) || 250;
  const p = palette();
  const PX = 3; // print pixels per unit

  // ───── print: brand on the front, handling marks on the short sides ─────
  type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };
  const frontPrint = printLayer(W * PX, H * PX, (c0) => {
    const c = c0 as Ctx;
    const s = W * PX;
    c.fillStyle = p.ink;
    c.font = `800 ${s * 0.14}px ${p.font}`;
    c.textBaseline = 'top';
    const x = s * 0.13, y = H * PX * 0.22;
    const lh = s * 0.14 * 0.95;
    c.letterSpacing = `${-s * 0.007}px`;
    c.fillText('HONEY', x, y);
    c.fillText('PACKERS', x, y + lh);
    c.font = `700 ${s * 0.028}px ${p.font}`;
    c.letterSpacing = `${s * 0.005}px`;
    c.fillText('PRECISION IN EVERY FOLD', x, y + lh * 2 + s * 0.03);
    // barcode
    const bx = s * 0.71, by = H * PX * 0.8, bw = s * 0.22, bh = H * PX * 0.11;
    const r = rnd(7);
    for (let i = 0; i < bw; ) {
      const lw = (1 + Math.floor(r() * 3)) * PX;
      c.fillRect(bx + i, by, lw * 0.8, bh);
      i += lw + (1 + Math.floor(r() * 3)) * PX;
    }
  }, 21);
  const sidePrint = (seed: number) =>
    printLayer(D * PX, H * PX, (c) => {
      const s = H * PX;
      c.fillStyle = p.ink;
      c.font = `800 ${s * 0.12}px ${p.font}`;
      c.textBaseline = 'top';
      c.fillText('↑↑', D * PX * 0.74, s * 0.08);
      c.font = `700 ${s * 0.04}px ${p.font}`;
      c.fillText('THIS SIDE UP', D * PX * 0.66, s * 0.22);
      c.fillText('KEEP DRY', D * PX * 0.66, s * 0.27);
    }, seed, 0.8);

  const carton = buildCarton(W, H, D, { tape: true });
  carton.setArt({ front: canvasTexture(frontPrint), right: canvasTexture(sidePrint(22)), left: canvasTexture(sidePrint(23)) });
  const root = new Group();
  root.add(carton.group);

  // ───── scene ─────
  const size = Math.round(Math.max(stage.offsetWidth, stage.offsetHeight) * 1.5);
  const canvas = document.createElement('canvas');
  canvas.className = 'hx__gl';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', left: '50%', top: '50%', width: `${size}px`, height: `${size}px`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' });
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);

  const scene = new Scene();
  lightScene(scene, renderer, 620);
  scene.add(shadowFloor(-H * 0.78, 2400), root);

  // same perspective as the CSS stage (1400px), in CSS pixels
  const persp = 1400;
  const camera = new PerspectiveCamera((2 * Math.atan(size / 2 / persp) * 180) / Math.PI, 1, 10, 6000);
  camera.position.set(0, 0, persp);

  // ───── follow the CSS carton's animation ─────
  const deg = (v: string, d: number) => ((parseFloat(v) || d) * Math.PI) / 180;
  let last = '';
  let visible = true;
  const draw = () => {
    const st = cssBox.style;
    const key = `${st.getPropertyValue('--ry')}|${st.getPropertyValue('--rx')}|${st.getPropertyValue('--rz')}|${st.getPropertyValue('--zoom')}|${st.getPropertyValue('--lid')}`;
    if (key !== last) {
      last = key;
      // CSS: rotateX(rx) rotateY(ry) rotateZ(rz), y down → three (y up): Rx(-rx) · Ry(ry) · Rz(-rz)
      root.rotation.set(-deg(st.getPropertyValue('--rx'), -19), deg(st.getPropertyValue('--ry'), -32), -deg(st.getPropertyValue('--rz'), 0), 'XYZ');
      root.scale.setScalar(parseFloat(st.getPropertyValue('--zoom')) || 1);
      // --lid runs 3° (closed) → 71° (open)
      carton.setOpen(((parseFloat(st.getPropertyValue('--lid')) || 3) - 3) / 68);
      renderer.render(scene, camera);
    }
    if (visible) requestAnimationFrame(draw);
  };

  stage.append(canvas);
  renderer.render(scene, camera);
  draw();
  cssBox.style.visibility = 'hidden';
  stage.classList.add('hx__stage--gl');

  // pause while off screen
  const watch = stage.closest<HTMLElement>('[data-hx]') ?? stage;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) requestAnimationFrame(draw);
    }).observe(watch);
  }
}
