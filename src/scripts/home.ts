import type { WebShop } from '@honeypackers/box-core/pricing';
import { catalog, priceList, productHref } from '../lib/catalog';
import { productTile, rs } from '../lib/product-card';
import { wireTiles } from '../lib/add-to-cart';
import { builderResult, builderText, gradesFor, toMm, type BuilderInput } from '../lib/box-builder';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll-driven hero: the carton turns and opens while three short stories change. */
function hero() {
  const hx = document.querySelector<HTMLElement>('[data-hx]');
  if (!hx) return;
  const box = hx.querySelector<HTMLElement>('[data-hx-box]')!;
  const stage = hx.querySelector<HTMLElement>('[data-hx-stage]')!;
  const slides = [...hx.querySelectorAll<HTMLElement>('[data-slide]')];
  const bar = hx.querySelector<HTMLElement>('[data-hx-bar]')!;
  const idx = hx.querySelector<HTMLElement>('[data-hx-idx]')!;
  const cap = hx.querySelector<HTMLElement>('[data-hx-cap]')!;
  const word = hx.querySelector<HTMLElement>('[data-hx-word]')!;
  const captions = ['Designed to impress', 'Engineered to protect', 'Built for your brand'];
  const words = [word.textContent || '', 'Precision', 'Impact'];
  let wanted = 0;
  let shown = -1;
  let last = 0;
  let raf = 0;
  let lastIndex = -1;

  // Sit under the sticky shop header, not behind it.
  const header = document.querySelector<HTMLElement>('.shop-header');
  const fitHeader = () => hx.style.setProperty('--hdr', `${header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0}px`);
  fitHeader();
  addEventListener('resize', fitHeader);
  const target = () => {
    const r = hx.getBoundingClientRect();
    const hdr = header?.offsetHeight ?? 0;
    return clamp((hdr - r.top) / Math.max(1, r.height - (innerHeight - hdr)), 0, 1);
  };
  const draw = (v: number) => {
    box.style.setProperty('--ry', `${(-32 + v * 400).toFixed(2)}deg`);
    box.style.setProperty('--rx', `${(-19 + Math.sin(v * Math.PI * 2) * 10).toFixed(2)}deg`);
    box.style.setProperty('--rz', `${(Math.sin(v * Math.PI * 2) * 4).toFixed(2)}deg`);
    box.style.setProperty('--zoom', (1 + Math.sin(v * Math.PI) * 0.1).toFixed(3));
    box.style.setProperty('--lid', `${(Math.max(0, Math.sin(v * Math.PI)) * 115).toFixed(1)}deg`);
    bar.style.width = `${(v * 100).toFixed(1)}%`;
    const pos = v * (slides.length - 1);
    let side = 0;
    let total = 0;
    slides.forEach((s, i) => {
      const d = i - pos;
      const dist = Math.abs(d);
      const right = s.classList.contains('hx__slide--r');
      s.style.opacity = clamp(1 - Math.max(0, dist - 0.12) * 2, 0, 1).toFixed(3);
      s.style.setProperty('--x', `${(d * (right ? 1 : -1) * 80).toFixed(1)}px`);
      s.style.setProperty('--y', `${(Math.min(dist, 1) * 28).toFixed(1)}px`);
      const on = dist < 0.3;
      s.style.pointerEvents = on ? 'auto' : 'none';
      s.inert = !on;
      const weight = Math.max(0, 1 - dist);
      side += (right ? -1 : 1) * weight;
      total += weight;
    });
    stage.style.setProperty('--shift', `${((total ? side / total : 1) * 22).toFixed(2)}vw`);
    const i = clamp(Math.round(pos), 0, slides.length - 1);
    if (i !== lastIndex) {
      lastIndex = i;
      idx.textContent = `0${i + 1} / 0${slides.length}`;
      cap.textContent = captions[i];
      word.textContent = words[i];
    }
  };
  const frame = (t: number) => {
    raf = 0;
    const dt = last ? clamp(t - last, 8, 44) : 16.7;
    last = t;
    shown = shown < 0 ? wanted : shown + (wanted - shown) * (1 - Math.exp(-dt / 110));
    if (Math.abs(wanted - shown) < 0.0001) shown = wanted;
    draw(shown);
    if (shown !== wanted) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const kick = () => {
    if (reduced()) return draw(0);
    wanted = target();
    if (!raf) raf = requestAnimationFrame(frame);
  };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  kick();
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
  });

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
    const l = Math.max(1, toMm(i.l, i.unit));
    const w = Math.max(1, toMm(i.w, i.unit));
    const h = Math.max(1, toMm(i.h, i.unit));
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
  // "Configure this box" cards preset the builder.
  document.querySelectorAll<HTMLAnchorElement>('.range__card[href="#configure"]').forEach((a) =>
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
  printSel.innerHTML = ['<option value="0">Plain, no printing</option>', ...Array.from({ length: shop.rules.printing.maxColours }, (_, k) => `<option value="${k + 1}">${k + 1} colour${k ? 's' : ''} printed</option>`)].join('');
  const qty = field('qty');
  if (num('qty') < shop.rules.limits.minQty) qty.value = String(shop.rules.limits.minQty);
  if (!gradesFor(shop, ply).length) ply = shop.rules.grades[0]?.ply ?? 3;
  fillGrades();
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
  hero();
  reveals();
  featured();
  void builder();
}
