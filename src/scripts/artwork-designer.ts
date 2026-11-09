// Print designer on /custom-box/: one side of the box at a time (front, back, left, right, top, bottom) on a canvas,
// with the buyer's logo and lines of text that can be dragged into place, resized, recoloured and removed.
// Each printed side is also rendered to a transparent picture that the 3D box on the page wraps onto that side.
// The design (box-core OrderArtwork, without file paths) and the logo are kept in sessionStorage so they
// survive the sign-in round trip; at checkout the logo and a rendered preview PNG go to the server.
import { INKS, MAX_ELEMENTS, MAX_TEXT } from '@honeypackers/box-core/artwork';
import type { ArtworkElement, PrintKind } from '@honeypackers/box-core/types';
import { BOX_SIDES, SIDE_LABEL, sideSize, type BoxSide } from '@honeypackers/box-core/box3d';

export interface ArtworkPayload {
  design: { ink: string; elements: ArtworkElement[] };
  logo: string | null;
  preview: string;
}

const STORE = 'hp-artwork';
const KRAFT = ['#e2bb86', '#d2a06b', '#c08c56'];
const MAX_LOGO_PX = 1200;
const uid = () => Math.random().toString(36).slice(2, 9);

export interface DesignerHooks {
  /** Anything changed (price text, WhatsApp text). */
  change(): void;
  /** The buyer switched to another side: turn the 3D box to it. */
  side(s: BoxSide): void;
  /** New side pictures are ready for the 3D box. */
  art(): void;
}

export function createDesigner(root: HTMLElement, hooks: DesignerHooks) {
  const onChange = hooks.change;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const canvas = $<HTMLCanvasElement>('[data-art-canvas]');
  const ctx = canvas.getContext('2d')!;
  const fileIn = $<HTMLInputElement>('[data-art-file]');
  const inkSel = $<HTMLSelectElement>('[data-art-ink]');
  const edit = $('[data-art-edit]');
  const textIn = $<HTMLInputElement>('[data-art-text]');
  const sizeIn = $<HTMLInputElement>('[data-art-size]');
  const colorSel = $<HTMLSelectElement>('[data-art-color]');
  const hint = $('[data-art-hint]');

  let kind: PrintKind = 'plain';
  let box = { length: 300, width: 200, height: 150 };
  let side: BoxSide = 'front';
  let face = sideSize(box, side);
  const sideOf = (e: ArtworkElement): BoxSide => e.side || 'front';
  /** Items on the side being edited (drawing, dragging and picking only look at these). */
  const here = () => els.filter((e) => sideOf(e) === side);
  let ink: string = INKS[0].id;
  let els: ArtworkElement[] = [];
  let logoUrl: string | null = null;
  let logoImg: HTMLImageElement | null = null;
  let selected: string | null = null;

  for (const i of INKS) {
    inkSel.add(new Option(i.label, i.id));
    colorSel.add(new Option(i.label, i.id));
  }

  /* ── saved design (survives the sign-in page) ── */
  const save = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ ink, els, logoUrl }));
    } catch {
      /* a very large logo may not fit; the design still works on this page */
    }
  };
  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
    if (s && Array.isArray(s.els)) {
      ink = typeof s.ink === 'string' ? s.ink : ink;
      els = s.els.slice(0, MAX_ELEMENTS);
      if (typeof s.logoUrl === 'string') {
        logoUrl = s.logoUrl;
        loadImage(s.logoUrl).then((img) => ((logoImg = img), draw()), () => (els = els.filter((e) => e.kind !== 'logo')));
      } else els = els.filter((e) => e.kind !== 'logo');
    }
  } catch {
    /* no saved design */
  }
  inkSel.value = ink;

  /* ── geometry ── */
  let W = 0;
  let H = 0;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const fit = () => {
    const holder = canvas.parentElement!;
    const maxW = holder.clientWidth;
    const maxH = Math.min(380, window.innerHeight * 0.5);
    const ratio = face.height / face.width;
    let w = maxW;
    let h = w * ratio;
    if (h > maxH) ((h = maxH), (w = h / ratio));
    W = Math.round(w);
    H = Math.round(h);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr());
    canvas.height = Math.round(H * dpr());
  };

  const font = (e: ArtworkElement, h: number) => `${e.bold === false ? 600 : 800} ${Math.max(6, (e.size || 0.1) * h)}px Manrope, system-ui, sans-serif`;
  /** Box of an element on a face w × h px: left, top, width, height. */
  const rect = (e: ArtworkElement, w: number, h: number, c = ctx) => {
    if (e.kind === 'logo') {
      const ew = (e.w || 0.35) * w;
      const eh = ew * (e.ratio || 1);
      return { x: e.x * w - ew / 2, y: e.y * h - eh / 2, w: ew, h: eh };
    }
    c.font = font(e, h);
    const tw = c.measureText(e.text || '').width;
    const th = (e.size || 0.1) * h;
    return { x: e.x * w - tw / 2, y: e.y * h - th / 2, w: tw, h: th };
  };
  /** Keep the whole item on the face. */
  const keepInside = (e: ArtworkElement) => {
    const r = rect(e, W, H);
    const hx = Math.min(0.5, r.w / 2 / W);
    const hy = Math.min(0.5, r.h / 2 / H);
    e.x = Math.min(1 - hx, Math.max(hx, e.x));
    e.y = Math.min(1 - hy, Math.max(hy, e.y));
  };
  const colourOf = (e: ArtworkElement) => (kind === 'one' ? ink : e.color || ink);

  /** One-colour print: the logo becomes a silhouette in the ink, as it will print. */
  const tinted = (img: HTMLImageElement, colour: string) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  };

  /** Kraft board with faint flutes (and the safe-area line while editing). */
  const paintBoard = (c: CanvasRenderingContext2D, w: number, h: number, withUi: boolean) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, KRAFT[0]);
    g.addColorStop(0.55, KRAFT[1]);
    g.addColorStop(1, KRAFT[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // flute lines, faint
    c.strokeStyle = 'rgba(94,58,32,0.05)';
    c.lineWidth = 1;
    for (let y = 3; y < h; y += 4) (c.beginPath(), c.moveTo(0, y), c.lineTo(w, y), c.stroke());
    if (withUi) {
      c.setLineDash([5, 5]);
      c.strokeStyle = 'rgba(94,58,32,0.35)';
      c.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      c.setLineDash([]);
    }
  };

  const paint = (c: CanvasRenderingContext2D, w: number, h: number, withUi: boolean, forSide: BoxSide = side, background = true) => {
    if (background) paintBoard(c, w, h, withUi);
    for (const e of els.filter((x) => sideOf(x) === forSide)) {
      const r = rect(e, w, h, c);
      if (e.kind === 'logo' && logoImg) c.drawImage(kind === 'one' ? tinted(logoImg, ink) : logoImg, r.x, r.y, r.w, r.h);
      if (e.kind === 'text') {
        c.font = font(e, h);
        c.fillStyle = colourOf(e);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(e.text || '', e.x * w, e.y * h);
      }
      if (withUi && e.id === selected) {
        c.strokeStyle = '#f98104';
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        c.setLineDash([]);
        c.fillStyle = '#f98104';
        c.fillRect(r.x + r.w - 5, r.y + r.h - 5, 14, 14); // resize handle
      }
    }
    if (withUi && !here().length) {
      c.fillStyle = 'rgba(94,58,32,0.55)';
      c.font = `600 ${Math.max(12, Math.min(18, w / 26))}px Manrope, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${SIDE_LABEL[forSide]}: add your logo or text, then drag it into place`, w / 2, h / 2);
    }
  };

  const draw = () => {
    if (!W) fit();
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    ctx.clearRect(0, 0, W, H);
    paint(ctx, W, H, true);
    syncEdit();
  };

  /* ── editing panel for the selected item ── */
  const sel = () => els.find((e) => e.id === selected) || null;
  function syncEdit() {
    const e = sel();
    edit.hidden = !e;
    inkSel.closest('label')!.hidden = kind !== 'one';
    hint.textContent = els.length >= MAX_ELEMENTS ? `Up to ${MAX_ELEMENTS} items.` : '';
    if (!e) return;
    $('[data-art-textwrap]').hidden = e.kind !== 'text';
    $('[data-art-colorwrap]').hidden = e.kind !== 'text' || kind !== 'multi';
    if (e.kind === 'text' && document.activeElement !== textIn) textIn.value = e.text || '';
    sizeIn.value = String(Math.round((e.kind === 'logo' ? e.w || 0.35 : (e.size || 0.1) * 2) * 100));
    colorSel.value = e.color || ink;
  }
  const changed = () => (save(), draw(), sideTabs(), queueArt(), onChange());

  /* ── side tabs: which side of the box is being edited ── */
  const tabs = $('[data-art-sides]');
  function sideTabs() {
    tabs.innerHTML = '';
    for (const s of BOX_SIDES) {
      const n = els.filter((e) => sideOf(e) === s).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s === side));
      b.innerHTML = `${SIDE_LABEL[s]}${n ? ` <b>${n}</b>` : ''}`;
      b.addEventListener('click', () => showSide(s));
      tabs.append(b);
    }
  }
  function showSide(s: BoxSide) {
    if (s === side) return;
    side = s;
    face = sideSize(box, side);
    selected = null;
    W = 0;
    draw();
    sideTabs();
    hooks.side(s);
  }

  /* ── pictures of each printed side for the 3D box (transparent, ink only) ── */
  let artUrls: Partial<Record<BoxSide, string>> = {};
  let artTimer = 0;
  function queueArt() {
    clearTimeout(artTimer);
    artTimer = window.setTimeout(renderArt, 120);
  }
  async function renderArt() {
    const next: Partial<Record<BoxSide, string>> = {};
    if (kind !== 'plain') {
      for (const s of BOX_SIDES) {
        if (!els.some((e) => sideOf(e) === s)) continue;
        const sz = sideSize(box, s);
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = Math.max(1, Math.round((640 * sz.height) / sz.width));
        paint(c.getContext('2d')!, c.width, c.height, false, s, false);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
        if (blob) next[s] = URL.createObjectURL(blob);
      }
    }
    Object.values(artUrls).forEach((u) => u && URL.revokeObjectURL(u));
    artUrls = next;
    hooks.art();
  }

  textIn.addEventListener('input', () => {
    const e = sel();
    if (e?.kind === 'text') ((e.text = textIn.value.slice(0, MAX_TEXT)), changed());
  });
  sizeIn.addEventListener('input', () => {
    const e = sel();
    if (!e) return;
    const v = Number(sizeIn.value) / 100;
    if (e.kind === 'logo') e.w = v;
    else e.size = v / 2;
    keepInside(e);
    changed();
  });
  colorSel.addEventListener('change', () => {
    const e = sel();
    if (e) ((e.color = colorSel.value), changed());
  });
  inkSel.addEventListener('change', () => ((ink = inkSel.value), changed()));
  $('[data-art-delete]').addEventListener('click', () => {
    const e = sel();
    if (!e) return;
    els = els.filter((x) => x !== e);
    if (e.kind === 'logo' && !els.some((x) => x.kind === 'logo')) ((logoUrl = null), (logoImg = null));
    canvas.focus();
    selected = null;
    changed();
  });

  /* ── add a logo / text ── */
  $('[data-art-addtext]').addEventListener('click', () => {
    if (els.length >= MAX_ELEMENTS) return;
    const e: ArtworkElement = { id: uid(), kind: 'text', side, text: 'Your text', x: 0.5, y: Math.min(0.85, 0.7 + here().filter((x) => x.kind === 'text').length * 0.12), size: 0.12, bold: true, color: ink };
    els.push(e);
    selected = e.id;
    changed();
    textIn.focus();
    textIn.select();
  });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return void (hint.textContent = 'Please choose a PNG, JPG or WebP picture.');
    try {
      const src = await loadImage(URL.createObjectURL(f));
      // Downscale big pictures; PNG keeps a transparent background, JPEG only when PNG is too large.
      const k = Math.min(1, MAX_LOGO_PX / Math.max(src.naturalWidth, src.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(src.naturalWidth * k));
      c.height = Math.max(1, Math.round(src.naturalHeight * k));
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      let url = c.toDataURL('image/png');
      if (url.length > 2_400_000) url = c.toDataURL('image/jpeg', 0.88);
      logoUrl = url;
      logoImg = await loadImage(url);
      const ratio = c.height / c.width;
      // One logo picture for the whole box: a new picture replaces it everywhere; this side gets it if it has none.
      els.filter((e) => e.kind === 'logo').forEach((e) => (e.ratio = ratio));
      let mine = here().find((e) => e.kind === 'logo');
      if (!mine && els.length < MAX_ELEMENTS) {
        mine = { id: uid(), kind: 'logo', side, x: 0.5, y: 0.4, w: Math.min(0.4, (0.55 / ratio) * (face.height / face.width)), ratio };
        els.unshift(mine);
      }
      selected = mine?.id ?? null;
      changed();
    } catch {
      hint.textContent = 'That picture could not be opened.';
    }
  });

  /* ── drag to move, corner handle to resize, arrows / Delete on the keyboard ── */
  let drag: { id: string; mode: 'move' | 'size'; dx: number; dy: number; start: number; sx: number } | null = null;
  const at = (ev: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    return { x: ev.clientX - b.left, y: ev.clientY - b.top };
  };
  canvas.addEventListener('pointerdown', (ev) => {
    const p = at(ev);
    const cur = sel();
    if (cur) {
      const r = rect(cur, W, H);
      if (Math.abs(p.x - (r.x + r.w + 2)) < 16 && Math.abs(p.y - (r.y + r.h + 2)) < 16) {
        drag = { id: cur.id, mode: 'size', dx: 0, dy: 0, start: cur.kind === 'logo' ? cur.w || 0.35 : cur.size || 0.1, sx: p.x };
        canvas.setPointerCapture(ev.pointerId);
        return;
      }
    }
    const hit = [...here()].reverse().find((e) => {
      const r = rect(e, W, H);
      return p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6;
    });
    selected = hit?.id ?? null;
    if (hit) {
      drag = { id: hit.id, mode: 'move', dx: p.x - hit.x * W, dy: p.y - hit.y * H, start: 0, sx: 0 };
      canvas.setPointerCapture(ev.pointerId);
    }
    draw();
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = at(ev);
    if (!drag) {
      const over = here().some((e) => {
        const r = rect(e, W, H);
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      canvas.style.cursor = over ? 'move' : 'default';
      return;
    }
    const e = els.find((x) => x.id === drag!.id);
    if (!e) return;
    if (drag.mode === 'move') {
      e.x = Math.min(1, Math.max(0, (p.x - drag.dx) / W));
      e.y = Math.min(1, Math.max(0, (p.y - drag.dy) / H));
    } else {
      const grow = 1 + ((p.x - drag.sx) * 2) / W / Math.max(0.05, drag.start * (e.kind === 'logo' ? 1 : 4));
      if (e.kind === 'logo') e.w = Math.min(1, Math.max(0.05, drag.start * grow));
      else e.size = Math.min(0.5, Math.max(0.03, drag.start * grow));
    }
    keepInside(e);
    draw();
  });
  const endDrag = () => {
    if (drag) ((drag = null), changed());
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (ev) => {
    const e = sel();
    if (!e) return;
    const step = ev.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[ev.key]) {
      ev.preventDefault();
      e.x = Math.min(1, Math.max(0, e.x + moves[ev.key][0]));
      e.y = Math.min(1, Math.max(0, e.y + moves[ev.key][1]));
      keepInside(e);
      changed();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      $<HTMLButtonElement>('[data-art-delete]').click();
    }
  });
  sideTabs();
  queueArt();
  window.addEventListener('resize', () => ((W = 0), draw()));
  document.fonts?.ready.then(() => draw());

  return {
    setKind(k: PrintKind) {
      kind = k;
      root.hidden = k === 'plain';
      if (!root.hidden) ((W = 0), draw());
    },
    /** The box size changed: every side's shape follows. */
    setBox(length: number, width: number, height: number) {
      if (!(length > 0 && width > 0 && height > 0)) return;
      if (length === box.length && width === box.width && height === box.height) return;
      box = { length, width, height };
      face = sideSize(box, side);
      if (!root.hidden) ((W = 0), draw());
      queueArt();
    },
    /** Pictures of the printed sides, for the 3D box. */
    sideArt: () => (kind === 'plain' ? {} : artUrls),
    currentSide: () => side,
    /** In words, for WhatsApp / enquiry text. */
    describe(): string {
      return BOX_SIDES.filter((s) => els.some((e) => sideOf(e) === s))
        .map((s) => `${SIDE_LABEL[s].toLowerCase()}: ${els.filter((e) => sideOf(e) === s).map((e) => (e.kind === 'logo' ? 'logo' : `“${e.text}”`)).join(', ')}`)
        .join('; ');
    },
    hasDesign: () => els.length > 0,
    /** What the server needs at checkout (null when nothing was designed). */
    payload(): ArtworkPayload | null {
      if (kind === 'plain' || !els.length) return null;
      // One picture of every printed side, side by side with its name, for the order.
      const sides = BOX_SIDES.filter((s) => els.some((e) => sideOf(e) === s));
      const PH = 360;
      const GAP = 30;
      const LABEL = 44;
      const sized = sides.map((s) => {
        const sz = sideSize(box, s);
        return { s, w: Math.round((PH * sz.width) / sz.height), h: PH };
      });
      const rowMax = 1800;
      const rows: (typeof sized)[] = [[]];
      for (const x of sized) {
        const row = rows[rows.length - 1];
        const used = row.reduce((t, y) => t + y.w + GAP, 0);
        if (row.length && used + x.w > rowMax) rows.push([x]);
        else row.push(x);
      }
      const out = document.createElement('canvas');
      out.width = Math.min(rowMax, Math.max(...rows.map((r) => r.reduce((t, y) => t + y.w + GAP, GAP))));
      out.height = rows.length * (PH + LABEL + GAP) + GAP;
      const c = out.getContext('2d')!;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, out.width, out.height);
      rows.forEach((row, ri) => {
        let x = GAP;
        const y = GAP + ri * (PH + LABEL + GAP);
        for (const it of row) {
          const sz = sideSize(box, it.s);
          c.fillStyle = '#5e3a20';
          c.font = '700 26px Manrope, system-ui, sans-serif';
          c.textAlign = 'left';
          c.textBaseline = 'top';
          c.fillText(`${SIDE_LABEL[it.s]}  ${sz.width} × ${sz.height} mm`, x, y);
          c.save();
          c.translate(x, y + LABEL);
          paint(c, it.w, it.h, false, it.s);
          c.restore();
          x += it.w + GAP;
        }
      });
      return { design: { ink, elements: els.map((e) => ({ ...e })) }, logo: els.some((e) => e.kind === 'logo') ? logoUrl : null, preview: out.toDataURL('image/png') };
    },
    clear() {
      try {
        sessionStorage.removeItem(STORE);
      } catch {
        /* ignore */
      }
    },
  };
}
