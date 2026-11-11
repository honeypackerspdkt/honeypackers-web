import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The hero carton as a real 3D object (three.js), owner's choice for a more realistic box (11 Nov 2026).
 * The CSS carton (.cbox) stays in the page: home.ts keeps animating its custom properties (--ry --rx --rz --zoom --lid)
 * and this scene copies them every frame, so the scroll story is unchanged. The CSS carton is hidden once the
 * 3D one has drawn; without WebGL nothing changes.
 * Board, print, flutes and tape are drawn on canvases at start-up (no image files).
 */

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

interface Palette {
  hi: string;
  base: string;
  lo: string;
  dark: string;
  ink: string;
  font: string;
}

/** Kraft board: base colour, soft blotches, paper grain and short fibres. Returns colour and relief canvases. */
function kraft(w: number, h: number, colour: string, p: Palette, seed: number, shade = 1): { map: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const r = rnd(seed);
  const map = document.createElement('canvas');
  const bump = document.createElement('canvas');
  map.width = bump.width = w;
  map.height = bump.height = h;
  const c = map.getContext('2d')!;
  const b = bump.getContext('2d')!;
  c.fillStyle = colour;
  c.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);
  // blotches: uneven pulp
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = (0.05 + r() * 0.2) * Math.max(w, h);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() > 0.5 ? p.hi : p.lo;
    g.addColorStop(0, tone);
    g.addColorStop(1, 'transparent');
    c.globalAlpha = 0.015 + r() * 0.02;
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibres: short streaks, mostly along the machine direction
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w, y = r() * h, len = 4 + r() * 22, a = (r() - 0.5) * 0.5;
    const light = r() > 0.35;
    c.globalAlpha = 0.03 + r() * 0.05;
    c.strokeStyle = light ? p.hi : p.dark;
    c.lineWidth = 0.5 + r() * 0.9;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
    b.globalAlpha = 0.25;
    b.strokeStyle = light ? '#c8c8c8' : '#3a3a3a';
    b.lineWidth = c.lineWidth;
    b.beginPath();
    b.moveTo(x, y);
    b.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    b.stroke();
  }
  c.globalAlpha = 1;
  b.globalAlpha = 1;
  // grain
  const img = c.getImageData(0, 0, w, h);
  const bim = b.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] * shade + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] * shade + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] * shade + n * 0.8));
    const bn = bim.data[i] + (r() - 0.5) * 30;
    bim.data[i] = bim.data[i + 1] = bim.data[i + 2] = Math.max(0, Math.min(255, bn));
  }
  c.putImageData(img, 0, 0);
  b.putImageData(bim, 0, 0);
  // faint corrugation showing through the liner (flutes run across the panel)
  c.globalAlpha = 0.025;
  b.globalAlpha = 0.14;
  for (let x = 0; x < w; x += 9) {
    c.fillStyle = p.dark;
    c.fillRect(x, 0, 2, h);
    b.fillStyle = '#5a5a5a';
    b.fillRect(x, 0, 3, h);
  }
  c.globalAlpha = b.globalAlpha = 1;
  return { map, bump };
}

/** Ink printed on board: the shapes are drawn on their own canvas, speckled, then multiplied onto the kraft. */
function ink(cv: HTMLCanvasElement, draw: (c: CanvasRenderingContext2D) => void, seed: number, alpha = 0.86) {
  const r = rnd(seed);
  const layer = document.createElement('canvas');
  layer.width = cv.width;
  layer.height = cv.height;
  const l = layer.getContext('2d')!;
  draw(l);
  l.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (layer.width * layer.height) / 220; i++) {
    l.globalAlpha = r() * 0.15;
    l.fillRect(r() * layer.width, r() * layer.height, 1 + r() * 2, 1 + r() * 2);
  }
  const c = cv.getContext('2d')!;
  c.globalAlpha = alpha;
  c.globalCompositeOperation = 'multiply';
  c.drawImage(layer, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/** Cut edge of the board: two liners with the wavy fluting between them. */
function flutes(p: Palette): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  c.fillStyle = p.dark;
  c.fillRect(0, 0, 64, 32);
  c.fillStyle = p.base;
  c.fillRect(0, 0, 64, 6);
  c.fillRect(0, 26, 64, 6);
  c.strokeStyle = p.hi;
  c.lineWidth = 3;
  c.beginPath();
  for (let x = 0; x <= 64; x++) c.lineTo(x, 16 + Math.sin((x / 64) * Math.PI * 4) * 9);
  c.stroke();
  return cv;
}

function texture(cv: HTMLCanvasElement, srgb = true, repeat?: [number, number]): Texture {
  const t = new CanvasTexture(cv);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function board(map: HTMLCanvasElement, bump: HTMLCanvasElement, rough = 0.88): MeshStandardMaterial {
  return new MeshStandardMaterial({ map: texture(map), bumpMap: texture(bump, false), bumpScale: 0.6, roughness: rough, metalness: 0, envMapIntensity: 0.22 });
}

export async function mountHero3d(stage: HTMLElement, cssBox: HTMLElement): Promise<void> {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
  await document.fonts?.ready;

  const W = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bw')) || 340;
  const H = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bh')) || 250;
  const D = parseFloat(getComputedStyle(cssBox).getPropertyValue('--bd')) || 250;
  const T = 5; // board thickness
  const p: Palette = {
    hi: css('--carton-hi', '#f2d4a6'),
    base: css('--carton', '#d2a06b'),
    lo: css('--carton-lo', '#a6703f'),
    dark: css('--carton-dark', '#865630'),
    ink: css('--carton-ink', '#5e3a20'),
    font: getComputedStyle(document.body).fontFamily || 'sans-serif',
  };
  const PX = 3; // texture pixels per world pixel

  // ───── surfaces ─────
  const front = kraft(W * PX, H * PX, p.base, p, 11, 0.9);
  ink(front.map, (c) => {
    const s = W * PX;
    c.fillStyle = p.ink;
    c.font = `800 ${s * 0.14}px ${p.font}`;
    c.textBaseline = 'top';
    const x = s * 0.13, y = H * PX * 0.22;
    const lh = s * 0.14 * 0.95;
    (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${-s * 0.007}px`;
    c.fillText('HONEY', x, y);
    c.fillText('PACKERS', x, y + lh);
    c.font = `700 ${s * 0.028}px ${p.font}`;
    (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${s * 0.005}px`;
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
  const back = kraft(W * PX, H * PX, p.base, p, 12, 0.88);
  const side = (seed: number) => {
    const k = kraft(D * PX, H * PX, p.base, p, seed, 0.88);
    ink(k.map, (c) => {
      const s = H * PX;
      c.fillStyle = p.ink;
      c.font = `800 ${s * 0.12}px ${p.font}`;
      c.textBaseline = 'top';
      c.fillText('↑↑', D * PX * 0.74, s * 0.08);
      c.font = `700 ${s * 0.04}px ${p.font}`;
      c.fillText('THIS SIDE UP', D * PX * 0.62, s * 0.22);
      c.fillText('KEEP DRY', D * PX * 0.62, s * 0.27);
    }, seed + 9, 0.8);
    return k;
  };
  const right = side(13);
  const left = side(14);
  const flapCv = kraft(W * PX, (D / 2) * PX, p.base, p, 15, 0.93);
  const inside = kraft(512, 512, p.lo, p, 16, 0.82);
  const fl = flutes(p);

  const outer = {
    front: board(front.map, front.bump),
    back: board(back.map, back.bump),
    right: board(right.map, right.bump),
    left: board(left.map, left.bump),
    flap: board(flapCv.map, flapCv.bump, 0.84),
  };
  const innerMat = new MeshStandardMaterial({ map: texture(inside.map, true, [2, 2]), bumpMap: texture(inside.bump, false, [2, 2]), bumpScale: 0.6, roughness: 0.95, envMapIntensity: 0.3 });
  const edge = (len: number) => new MeshStandardMaterial({ map: texture(fl, true, [len / 8, 1]), roughness: 0.95, envMapIntensity: 0.3 });
  const plainEdge = new MeshStandardMaterial({ color: new Color(p.lo), roughness: 0.95 });

  // tape: glossy brown packing tape with faint lengthwise streaks
  const tapeCv = document.createElement('canvas');
  tapeCv.width = 64;
  tapeCv.height = 256;
  {
    const c = tapeCv.getContext('2d')!;
    c.fillStyle = '#808080';
    c.fillRect(0, 0, 64, 256);
    const r = rnd(5);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = r() > 0.5 ? '#9a9a9a' : '#6a6a6a';
      c.fillRect(r() * 64, 0, 1, 256);
    }
  }
  const tapeMat = new MeshPhysicalMaterial({
    color: new Color(p.lo).lerp(new Color(p.dark), 0.7),
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.92,
    bumpMap: texture(tapeCv, false),
    bumpScale: 0.25,
    envMapIntensity: 1.1,
  });

  // ───── geometry ─────
  const root = new Group();
  const shadowed = (m: Mesh) => ((m.castShadow = true), (m.receiveShadow = true), m);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const wallH = H - T;
  const frontWall = shadowed(new Mesh(new BoxGeometry(W, wallH, T), [plainEdge, plainEdge, edge(W), plainEdge, outer.front, innerMat]));
  frontWall.position.set(0, -T / 2, D / 2 - T / 2);
  const backWall = shadowed(new Mesh(new BoxGeometry(W, wallH, T), [plainEdge, plainEdge, edge(W), plainEdge, innerMat, outer.back]));
  backWall.position.set(0, -T / 2, -D / 2 + T / 2);
  const rightWall = shadowed(new Mesh(new BoxGeometry(T, wallH, D - 2 * T), [outer.right, innerMat, edge(D), plainEdge, plainEdge, plainEdge]));
  rightWall.position.set(W / 2 - T / 2, -T / 2, 0);
  const leftWall = shadowed(new Mesh(new BoxGeometry(T, wallH, D - 2 * T), [innerMat, outer.left, edge(D), plainEdge, plainEdge, plainEdge]));
  leftWall.position.set(-W / 2 + T / 2, -T / 2, 0);
  const bottom = shadowed(new Mesh(new BoxGeometry(W - 2 * T, T, D - 2 * T), innerMat));
  bottom.position.set(0, -H / 2 + T, 0);
  root.add(frontWall, backWall, rightWall, leftWall, bottom);

  const tapeW = W * 0.16;
  const tape = (len: number) => {
    const m = new Mesh(new BoxGeometry(tapeW, 0.6, len), tapeMat);
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  };
  // flaps hinge on the back (A) and front (B) top edges; their tape halves split when the lid opens
  const flapGeo = new BoxGeometry(W, T, D / 2);
  const flap = (sign: 1 | -1) => {
    const pivot = new Group();
    pivot.position.set(0, H / 2 - T / 2, (sign * D) / 2);
    const m = shadowed(new Mesh(flapGeo, [plainEdge, plainEdge, outer.flap, innerMat, sign > 0 ? plainEdge : edge(W), sign > 0 ? edge(W) : plainEdge]));
    m.position.set(0, 0, (-sign * D) / 4);
    const t = tape(D / 2);
    t.position.set(0, T / 2 + 0.3, (-sign * D) / 4);
    pivot.add(m, t);
    root.add(pivot);
    return pivot;
  };
  const flapA = flap(-1);
  const flapB = flap(1);
  // tape running down the front and the back
  const drop = H * 0.24;
  const frontTape = new Mesh(new BoxGeometry(tapeW, drop, 0.6), tapeMat);
  frontTape.position.set(0, H / 2 - drop / 2, D / 2 + 0.35);
  const backTape = frontTape.clone();
  backTape.position.z = -D / 2 - 0.35;
  root.add(frontTape, backTape);

  // ───── scene ─────
  const size = Math.round(Math.max(stage.offsetWidth, stage.offsetHeight) * 1.5);
  const canvas = document.createElement('canvas');
  canvas.className = 'hx__gl';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', left: '50%', top: '50%', width: `${size}px`, height: `${size}px`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' });
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  // same perspective as the CSS stage (1400px), in CSS pixels
  const persp = 1400;
  const camera = new PerspectiveCamera((2 * Math.atan(size / 2 / persp) * 180) / Math.PI, 1, 10, 6000);
  camera.position.set(0, 0, persp);

  const key = new DirectionalLight(0xfff1de, 2.4);
  key.position.set(-420, 760, 620);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -520;
  key.shadow.camera.right = key.shadow.camera.top = 520;
  key.shadow.camera.near = 100;
  key.shadow.camera.far = 2400;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  const fill = new DirectionalLight(0xffe0c4, 0.28);
  fill.position.set(600, 120, 400);
  scene.add(key, fill, new HemisphereLight(0xfff8ef, 0x6b4426, 0.3));

  const floor = new Mesh(new PlaneGeometry(2400, 2400), new ShadowMaterial({ opacity: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -H * 0.78;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(root);

  // ───── follow the CSS carton's animation ─────
  const deg = (v: string, d: number) => ((parseFloat(v) || d) * Math.PI) / 180;
  let last = '';
  let visible = true;
  const draw = () => {
    const st = cssBox.style;
    const key2 = `${st.getPropertyValue('--ry')}|${st.getPropertyValue('--rx')}|${st.getPropertyValue('--rz')}|${st.getPropertyValue('--zoom')}|${st.getPropertyValue('--lid')}`;
    if (key2 !== last) {
      last = key2;
      // CSS: rotateX(rx) rotateY(ry) rotateZ(rz), y down → three (y up): Rx(-rx) · Ry(ry) · Rz(-rz)
      root.rotation.set(-deg(st.getPropertyValue('--rx'), -19), deg(st.getPropertyValue('--ry'), -32), -deg(st.getPropertyValue('--rz'), 0), 'XYZ');
      root.scale.setScalar(parseFloat(st.getPropertyValue('--zoom')) || 1);
      const lid = deg(st.getPropertyValue('--lid'), 3);
      flapA.rotation.x = -lid;
      flapB.rotation.x = lid;
      renderer.render(scene, camera);
    }
    if (visible) requestAnimationFrame(draw);
  };

  stage.append(canvas);
  renderer.render(scene, camera);
  draw();
  cssBox.style.visibility = 'hidden';
  stage.classList.add('hx__stage--gl');

  // pause while the hero is off screen
  const hero = stage.closest<HTMLElement>('[data-hx]');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) requestAnimationFrame(draw);
    }).observe(hero);
  }
}
