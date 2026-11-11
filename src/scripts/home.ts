import { printColours, printKindsFor } from '@honeypackers/box-core/artwork';
import type { WebShop } from '@honeypackers/box-core/pricing';
import { catalog, priceList, productHref } from '../lib/catalog';
import { productTile, rs } from '../lib/product-card';
import { wireTiles } from '../lib/add-to-cart';
import { builderResult, builderText, gradesFor, sizeMm, type BuilderInput } from '../lib/box-builder';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The owner's cinematic motion, one rAF loop for everything (ported from the original preview page):
 * - hero: the carton turns (690°), tilts, zooms and opens while three short stories change;
 * - a copy of the carton then stays with you down the whole page, keeps turning with the scroll and glides
 *   to the side away from each chapter's heading, with a big word behind it;
 * - each chapter's heading slides in from its side and its content drifts in.
 * Frame-time-independent easing, so it feels the same on 60, 90 and 120 Hz screens.
 */
function motion() {
  const hx = document.querySelector<HTMLElement>('[data-hx]');
  if (!hx) return;
  const box = hx.querySelector<HTMLElement>('[data-hx-box]')!;
  const stage = hx.querySelector<HTMLElement>('[data-hx-stage]')!;
  const slides = [...hx.querySelectorAll<HTMLElement>('[data-slide]')];
  const bar = hx.querySelector<HTMLElement>('[data-hx-bar]')!;
  const idx = hx.querySelector<HTMLElement>('[data-hx-idx]')!;
  const cap = hx.querySelector<HTMLElement>('[data-hx-cap]')!;
  const word = hx.querySelector<HTMLElement>('[data-hx-word]')!;
  const captions = ['Designed to impress', 'Built for your brand'];
  const words = [word.textContent || '', 'Impact'];
  const chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
  const quote = document.getElementById('quote');
  // The light trust strip above the footer: the carton fades out before it.
  const footer = document.querySelector<HTMLElement>('.trust-strip') ?? document.querySelector<HTMLElement>('.site-footer');

  // The following carton: a click-through copy of the hero carton, fixed behind the page content.
  const amb = document.createElement('div');
  amb.className = 'hp-amb';
  amb.setAttribute('aria-hidden', 'true');
  const ambStage = stage.cloneNode(true) as HTMLElement;
  ambStage.removeAttribute('data-hx-stage');
  const ambBox = ambStage.querySelector<HTMLElement>('[data-hx-box]')!;
  ambBox.removeAttribute('data-hx-box');
  const ambWord = document.createElement('span');
  ambWord.className = 'hp-amb__word';
  amb.append(ambStage, ambWord);
  document.body.append(amb); // last in the page: above section backgrounds, below content (z-index in home.css)

  // Sit under the sticky shop header, not behind it.
  const header = document.querySelector<HTMLElement>('.shop-header');
  const hdr = () => (header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0);
  const fitHeader = () => hx.style.setProperty('--hdr', `${hdr()}px`);
  fitHeader();

  let wanted = 0, shown = -1; // hero progress
  let ambGoal = 0, ambNow = -1; // whole-page progress after the hero
  let ambLeft = 79; // carton position, % of the screen width
  let last = 0, raf = 0, lastIndex = -1, active = '';
  let eased = new WeakMap<HTMLElement, Record<string, number>>();
  const damp = (dt: number, ms: number) => 1 - Math.exp(-dt / ms);
  const ease = (el: HTMLElement, key: string, target: number, dt: number, lag: number, initial: number) => {
    let st = eased.get(el);
    if (!st) eased.set(el, (st = {}));
    const prev = st[key] ?? initial;
    const next = prev + (target - prev) * damp(dt, lag);
    return (st[key] = Math.abs(target - next) < 0.075 ? target : next);
  };

  const drawHero = (v: number) => {
    box.style.setProperty('--ry', `${(-30 + v * 690).toFixed(2)}deg`);
    box.style.setProperty('--rx', `${(-19 + Math.sin(v * Math.PI * 2) * 11).toFixed(2)}deg`);
    box.style.setProperty('--rz', `${(Math.sin(v * Math.PI * 2) * 5).toFixed(2)}deg`);
    box.style.setProperty('--zoom', (1 + Math.sin(v * Math.PI) * 0.11).toFixed(3));
    const opening = Math.max(0, Math.sin(v * Math.PI) * 0.85);
    box.style.setProperty('--lid', `${(3 + opening * 68).toFixed(2)}deg`);
    bar.style.width = `${(v * 100).toFixed(1)}%`;
    const pos = v * (slides.length - 1);
    let side = 0, total = 0;
    slides.forEach((s, i) => {
      const d = i - pos;
      const dist = Math.abs(d);
      const right = s.classList.contains('hx__slide--r');
      s.style.opacity = clamp(1 - dist * 1.65, 0, 1).toFixed(3);
      s.style.filter = `blur(${(Math.min(dist, 1) * 6).toFixed(2)}px)`;
      s.style.setProperty('--x', `${(d * (right ? 1 : -1) * 90).toFixed(2)}px`);
      s.style.setProperty('--y', `${(Math.min(dist, 1) * 32).toFixed(2)}px`);
      const on = dist < 0.3;
      s.style.pointerEvents = on ? 'auto' : 'none';
      s.inert = !on;
      const weight = Math.max(0, 1 - dist);
      side += (right ? -1 : 1) * weight;
      total += weight;
    });
    // Move the carton away from the active headline, not across the reading area.
    stage.style.setProperty('--shift', `${((total ? side / total : 1) * 24).toFixed(2)}vw`);
    const i = clamp(Math.round(pos), 0, slides.length - 1);
    if (i !== lastIndex) {
      lastIndex = i;
      idx.textContent = `0${i + 1} / 0${slides.length}`;
      cap.textContent = captions[i];
      word.textContent = words[i];
    }
  };

  const drawAmbient = (a: number) => {
    ambBox.style.setProperty('--ry', `${(660 + a * 1600).toFixed(2)}deg`);
    ambBox.style.setProperty('--rx', `${(-19 + Math.sin(a * Math.PI * 5) * 14).toFixed(2)}deg`);
    ambBox.style.setProperty('--rz', `${(Math.sin(a * Math.PI * 3) * 7).toFixed(2)}deg`);
    ambBox.style.setProperty('--zoom', (1 + Math.sin(a * Math.PI * 4) * 0.08).toFixed(3));
    ambBox.style.setProperty('--lid', '0deg');
  };

  // Read layout once per frame, then ease each chapter toward its scroll target. Returns true while moving.
  const syncChapters = (dt: number) => {
    const h = innerHeight;
    let selected: HTMLElement | null = null, best = Infinity, moving = false;
    for (const sec of chapters) {
      const r = sec.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h) {
        const dist = Math.abs(r.top + r.height / 2 - h / 2);
        if (dist < best) { best = dist; selected = sec; }
      }
      const dir = sec.classList.contains('chap--r') ? 1 : -1;
      const entry = clamp((h * 0.89 - r.top) / (h * 0.56), 0, 1);
      sec.querySelectorAll<HTMLElement>('.chap-move').forEach((el) => {
        // Slide up to 88px, but never past the screen edge (the gutter is small on laptops and phones).
        const now = eased.get(el)?.x ?? 0;
        const er = el.getBoundingClientRect();
        const room = Math.max(0, (dir < 0 ? er.left - now : innerWidth - (er.right - now)) - 4);
        const shiftT = (1 - entry) * dir * Math.min(88, room), opT = 0.8 + entry * 0.2;
        const shift = ease(el, 'x', shiftT, dt, 135, shiftT);
        const op = ease(el, 'o', opT, dt, 160, 0.8);
        el.style.setProperty('--chapter-shift', `${shift.toFixed(2)}px`);
        el.style.setProperty('--chapter-opacity', op.toFixed(4));
        if (Math.abs(shiftT - shift) > 0.09 || Math.abs(opT - op) > 0.002) moving = true;
      });
      sec.querySelectorAll<HTMLElement>('.chap-item').forEach((el, i) => {
        const ri = el.getBoundingClientRect();
        const e = clamp((h * 0.96 - ri.top) / (h * 0.57), 0, 1);
        const d = (i % 2 === 0 ? -1 : 1) * (dir === 1 ? -1 : 1);
        const shiftT = (1 - e) * d * 54, opT = 0.86 + e * 0.14;
        const shift = ease(el, 'x', shiftT, dt, 155, d * 54);
        const op = ease(el, 'o', opT, dt, 178, 0.86);
        el.style.setProperty('--chapter-item-shift', `${shift.toFixed(2)}px`);
        el.style.setProperty('--chapter-item-opacity', op.toFixed(4));
        if (Math.abs(shiftT - shift) > 0.09 || Math.abs(opT - op) > 0.002) moving = true;
      });
    }
    // The carton glides across the page to the side away from the heading, instead of snapping.
    let targetLeft = 79;
    if (selected) {
      const key = selected.dataset.chapter || '';
      targetLeft = selected.classList.contains('chap--r') ? 23 : 79;
      if (key === 'configure') targetLeft = 77;
      if (key !== active) {
        active = key;
        ambWord.textContent = selected.dataset.word || '';
        ambWord.animate?.(
          [{ opacity: 0.25, transform: 'translate(-50%,-50%) scale(.975)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }],
          { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' },
        );
      }
    }
    ambLeft += (targetLeft - ambLeft) * damp(dt, 285);
    if (Math.abs(ambLeft - targetLeft) < 0.055) ambLeft = targetLeft;
    else if (Math.abs(ambLeft - targetLeft) > 0.07) moving = true;
    ambStage.style.setProperty('--ambient-shift', `${(ambLeft - 50).toFixed(2)}vw`);
    return moving;
  };

  const frame = (t: number) => {
    raf = 0;
    if (reduced()) return;
    const dt = last ? clamp(t - last, 8, 44) : 16.67;
    last = t;
    shown = shown < 0 ? wanted : shown + (wanted - shown) * damp(dt, 112);
    ambNow = ambNow < 0 ? ambGoal : ambNow + (ambGoal - ambNow) * damp(dt, 195);
    if (Math.abs(wanted - shown) < 0.000055) shown = wanted;
    if (Math.abs(ambGoal - ambNow) < 0.000055) ambNow = ambGoal;
    drawHero(shown);
    drawAmbient(ambNow);
    const busy = syncChapters(dt);
    if (shown !== wanted || ambNow !== ambGoal || busy) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  const measure = () => {
    if (reduced()) return;
    const top = hx.getBoundingClientRect().top + scrollY;
    const heroEnd = top + hx.offsetHeight;
    const hh = header?.offsetHeight ?? 0;
    wanted = clamp((scrollY + hh - top) / Math.max(1, hx.offsetHeight - (innerHeight - hh)), 0, 1);
    // Whole-page progress starts as the hero finishes.
    const end = Math.max(heroEnd + 1, document.documentElement.scrollHeight - innerHeight);
    ambGoal = clamp((scrollY - heroEnd) / (end - heroEnd), 0, 1);
    amb.classList.toggle('is-visible', scrollY >= heroEnd - innerHeight * 0.18);
    const footTop = footer ? footer.getBoundingClientRect().top : Infinity; // on screen, px from the top
    const inQuote = !!quote && quote.getBoundingClientRect().top <= innerHeight * 0.55 && footTop > 0;
    amb.classList.toggle('is-dark', inQuote);
    amb.classList.toggle('is-footer', footTop <= innerHeight * 0.8); // fade before the carton reaches the light strip
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const onMotionChange = () => {
    if (reduced()) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      amb.classList.remove('is-visible');
      slides.forEach((s, i) => {
        s.style.removeProperty('opacity');
        s.style.removeProperty('filter');
        s.inert = i !== 0;
      });
      for (const el of document.querySelectorAll<HTMLElement>('.chap-move, .chap-item')) el.removeAttribute('style');
      return;
    }
    shown = ambNow = -1;
    ambLeft = 79;
    last = 0;
    eased = new WeakMap();
    measure();
  };

  addEventListener('scroll', measure, { passive: true });
  addEventListener('resize', () => { fitHeader(); measure(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
    last = 0;
    if (!document.hidden) measure();
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', onMotionChange);
  onMotionChange();
}

/** Sections slide in once as they come into view. */
function reveals() {
  const els = [...document.querySelectorAll<HTMLElement>('.reveal')];
  if (!('IntersectionObserver' in window) || reduced()) return;
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }),
    { threshold: 0.08, rootMargin: '0px 0px -20px 0px' },
  );
  els.forEach((el) => io.observe(el));
}

/** Box builder: live carton, real price from box-core, order link, enquiry text. */
async function builder() {
  const root = document.querySelector<HTMLElement>('[data-bb]');
  if (!root) return;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const form = $<HTMLFormElement>('[data-bb-form]');
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement;
  const gradeSel = $<HTMLSelectElement>('[data-bb-grade]');
  const printSel = $<HTMLSelectElement>('[data-bb-print]');
  const box = $('[data-bb-box]');
  const details = document.querySelector<HTMLTextAreaElement>('[data-enquiry-details]');
  let unit: 'mm' | 'in' = 'mm';
  let ply = 5;
  let shop: WebShop | null = null;
  let detailsTouched = false;
  details?.addEventListener('input', () => (detailsTouched = true));

  const num = (n: string) => Number(String(field(n).value).replace(',', '.')) || 0;
  const input = (): BuilderInput => ({
    style: field('style').value as BuilderInput['style'],
    unit,
    l: num('l'),
    w: num('w'),
    h: num('h'),
    gradeId: gradeSel.value,
    colours: Number(printSel.value) || 0,
    qty: Math.floor(num('qty')),
    mm: unit === 'in' ? exactMm() : undefined,
  });
  // Sizes typed in mm and not edited since switching to inches keep their exact mm.
  const exactMm = () => {
    const out: BuilderInput['mm'] = {};
    for (const n of ['l', 'w', 'h'] as const) {
      const f = field(n);
      if (f.dataset.mm && f.dataset.shown === f.value) out[n] = Number(f.dataset.mm);
    }
    return out;
  };

  const fillGrades = () => {
    if (!shop) return;
    const list = gradesFor(shop, ply);
    const keep = gradeSel.value;
    gradeSel.innerHTML = list.map((g) => `<option value="${g.id}">${g.label.replace(/[<>&]/g, '')}</option>`).join('');
    if (list.some((g) => g.id === keep)) gradeSel.value = keep;
    root.querySelectorAll<HTMLButtonElement>('[data-ply]').forEach((b) => {
      b.disabled = !gradesFor(shop!, Number(b.dataset.ply)).length;
      b.setAttribute('aria-pressed', String(Number(b.dataset.ply) === ply));
    });
  };

  const shape = (i: BuilderInput) => {
    const l = Math.max(1, sizeMm(i, 'l'));
    const w = Math.max(1, sizeMm(i, 'w'));
    const h = Math.max(1, sizeMm(i, 'h'));
    const big = Math.max(l, w, h);
    const s = (v: number, lo: number, hi: number) => `${Math.round(clamp((hi * v) / big, lo, hi))}px`;
    box.style.setProperty('--bw', s(l, 110, 220));
    box.style.setProperty('--bh', s(h, 60, 170));
    box.style.setProperty('--bd', s(w, 60, 150));
  };

  const update = () => {
    const i = input();
    shape(i);
    const u = unit === 'in' ? 'inch' : 'mm';
    $('[data-bb-dim]').textContent = `${i.l} × ${i.w} × ${i.h} ${u}`;
    $('[data-bb-qty]').textContent = `${Math.max(0, i.qty).toLocaleString('en-IN')} boxes`;
    if (!shop) return;
    const grade = shop.rules.grades.find((g) => g.id === i.gradeId);
    const r = builderResult(i, shop);
    $('[data-bb-board]').textContent = grade ? `${grade.ply} ply${r.kind === 'price' ? ` · BS ${r.bs}` : ''}` : '-';
    const order = $<HTMLAnchorElement>('[data-bb-order]');
    if (r.kind === 'price') {
      $('[data-bb-price]').textContent = rs(r.unitPrice);
      $('[data-bb-per]').textContent = 'a box + GST';
      $('[data-bb-note]').textContent = `${rs(r.amount)} for ${i.qty.toLocaleString('en-IN')} boxes + GST · about ${Math.round(r.weightKg * i.qty)} kg${shopSample ? ' · sample prices until our live price list is switched on' : ''}`;
      order.href = r.orderHref;
      order.hidden = false;
    } else {
      $('[data-bb-price]').textContent = 'Price on request';
      $('[data-bb-per]').textContent = '';
      $('[data-bb-note]').textContent = r.message;
      order.hidden = true;
    }
    if (details && !detailsTouched) details.value = builderText(i, shop, r);
  };

  let shopSample = false;
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const p = t.closest<HTMLButtonElement>('[data-ply]');
    if (p && !p.disabled) {
      ply = Number(p.dataset.ply);
      fillGrades();
      update();
    }
    const u = t.closest<HTMLButtonElement>('[data-unit]');
    if (u && u.dataset.unit !== unit) {
      const next = u.dataset.unit as 'mm' | 'in';
      for (const n of ['l', 'w', 'h']) {
        const f = field(n);
        const v = num(n);
        if (next === 'in') {
          f.dataset.mm = f.value;
          f.value = String(Math.round((v / 25.4) * 10) / 10);
          f.dataset.shown = f.value;
        } else {
          // Back to mm: the exact mm the buyer typed, unless they changed the inch value.
          f.value = f.dataset.mm && f.dataset.shown === f.value ? f.dataset.mm : String(Math.round(v * 25.4));
        }
      }
      unit = next;
      root.querySelectorAll('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b === u)));
      update();
    }
    const q = t.closest<HTMLButtonElement>('[data-qty]');
    if (q) {
      field('qty').value = String(clamp(Math.floor(num('qty')) + Number(q.dataset.qty) * 100, 1, 1_000_000));
      update();
    }
  });
  // Category tiles and banners that lead to the builder preset its style / printing.
  document.querySelectorAll<HTMLAnchorElement>('a[href="#configure"][data-preset]').forEach((a) =>
    a.addEventListener('click', () => {
      if (a.dataset.style) field('style').value = a.dataset.style;
      else field('style').value = 'rsc';
      if (a.dataset.print && Number(printSel.value) === 0 && printSel.options.length > 1) printSel.value = a.dataset.print;
      update();
    }),
  );
  update();

  const l = await priceList();
  shop = l.shop;
  shopSample = l.source !== 'live';
  // Plain, 1 colour or multicolour (priced at the most colours the price list allows).
  const maxC = shop.rules.printing.maxColours;
  const printNames = { plain: 'Plain, no printing', one: '1 colour print', multi: 'Multicolour print' };
  printSel.innerHTML = printKindsFor(maxC).map((k) => `<option value="${printColours(k, maxC)}">${printNames[k]}</option>`).join('');
  const qty = field('qty');
  if (num('qty') < shop.rules.limits.minQty) qty.value = String(shop.rules.limits.minQty);
  if (!gradesFor(shop, ply).length) ply = shop.rules.grades[0]?.ply ?? 3;
  fillGrades();
  // Links from the category bar on other pages: /?box=diecut#configure, /?box=printed#configure.
  const want = new URLSearchParams(location.search).get('box');
  if (want === 'diecut') field('style').value = 'diecut';
  if (want === 'printed' && printSel.options.length > 1) printSel.value = '1';
  $('[data-bb-status]').textContent = shopSample ? 'Sample prices' : '● Live prices';
  update();
}

/** Featured packs: build-time tiles, refreshed with live products. */
function featured() {
  const box = document.querySelector<HTMLElement>('[data-featured]');
  if (!box) return;
  const tiles = box.querySelector<HTMLElement>('[data-tiles]')!;
  const built = new Set<string>(JSON.parse(box.dataset.built || '[]'));
  wireTiles(tiles);
  void catalog().then((r) => {
    if (r.source === 'live') tiles.innerHTML = r.products.slice(0, 4).map((p) => productTile(p, productHref(p, built))).join('');
  });
}

export function initHome() {
  motion();
  reveals();
  featured();
  void builder();
}
