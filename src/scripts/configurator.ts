import { checkoutTotals, deliveryCharge, findZone, gradeLabel, priceCustomBox, slabFor, slabTable, type WebShop } from '@honeypackers/box-core/pricing';
import { clampPitch, defaultView, SIDE_VIEW, type View } from '@honeypackers/box-core/box3d';
import { defaultCompany } from '@honeypackers/box-core/company';
import { boxLabel, boxSvgInner } from '../lib/box-svg';
import { liveConfig, loadPriceList, samplePriceList } from '../lib/price-list';
import { quoteText } from '../lib/quote-text';
import { printColours, printKindOf, printKindsFor } from '@honeypackers/box-core/artwork';
import type { PrintKind } from '@honeypackers/box-core/types';
import { createDesigner } from './artwork-designer';

const TAX_PCT = defaultCompany.defaults.taxPct; // 5% for corrugated boxes (HSN 4819)
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const rs = (n: number) => `₹${inr.format(n)}`;

export async function initConfigurator(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('[data-form]');
  const svg = $<SVGSVGElement>('[data-box]');
  const whatsapp = root.dataset.wa || '';
  const business = root.dataset.name || '';
  let shop: WebShop = samplePriceList().shop;
  let view: View = { ...defaultView };
  let canBuy = false;
  let liveLoaded = false;
  const designer = createDesigner(root.querySelector<HTMLElement>('[data-art]')!, {
    change: () => update(),
    // Turn the 3D box to the side being designed.
    side: (s) => turnTo(SIDE_VIEW[s]),
    art: () => drawBox(),
  });
  let turning = 0;
  /** Ease the 3D box to a view (straight there when motion is reduced). */
  const turnTo = (to: View) => {
    cancelAnimationFrame(turning);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void ((view = { ...to }), drawBox());
    const from = { ...view };
    // shortest way round
    let dy = to.yaw - from.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 450);
      const e = 1 - (1 - k) ** 3;
      view = { yaw: from.yaw + dy * e, pitch: from.pitch + (to.pitch - from.pitch) * e };
      drawBox();
      if (k < 1) turning = requestAnimationFrame(step);
    };
    turning = requestAnimationFrame(step);
  };

  // Restore a shared link (?l=…&w=…&h=…&g=…&c=…&q=…&pin=…)
  const qs = new URLSearchParams(location.search);
  const setIf = (name: string, v: string | null) => {
    if (v == null) return;
    const el = form.elements.namedItem(name);
    if (el instanceof RadioNodeList) el.value = v;
    else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = v;
  };
  setIf('length', qs.get('l'));
  setIf('width', qs.get('w'));
  setIf('height', qs.get('h'));
  setIf('print', qs.get('p') || (qs.get('c') != null ? printKindOf(Number(qs.get('c'))) : null));
  setIf('qty', qs.get('q'));
  setIf('pincode', qs.get('pin'));
  const wantedGrade = qs.get('g');

  const read = () => {
    const fd = new FormData(form);
    const num = (k: string) => Number(fd.get(k) || 0);
    return {
      length: num('length'),
      width: num('width'),
      height: num('height'),
      gradeId: String(fd.get('grade') || ''),
      print: (String(fd.get('print') || 'plain') as PrintKind),
      colours: printColours(String(fd.get('print') || 'plain') as PrintKind, shop.rules.printing.maxColours),
      qty: Math.floor(num('qty')),
      pincode: String(fd.get('pincode') || '').trim(),
    };
  };

  const fillGrades = () => {
    const sel = $<HTMLSelectElement>('[data-grades]');
    const keep = wantedGrade ?? sel.value;
    sel.innerHTML = '';
    for (const g of shop.rules.grades) sel.add(new Option(g.label || gradeLabel(g), g.id));
    if (shop.rules.grades.some((g) => g.id === keep)) sel.value = keep;
    // printing the price list does not allow is not offered
    const kinds = printKindsFor(shop.rules.printing.maxColours);
    root.querySelectorAll<HTMLInputElement>('[data-colours] input').forEach((r) => {
      const hide = !kinds.includes(r.value as PrintKind);
      r.closest('label')!.hidden = hide;
      if (hide && r.checked) (root.querySelector<HTMLInputElement>('[data-colours] input[value="plain"]')!).checked = true;
    });
  };

  const drawBox = () => {
    const s = read();
    const dims = { length: s.length || 300, width: s.width || 200, height: s.height || 150 };
    svg.innerHTML = boxSvgInner(dims, view, true, designer.sideArt());
    svg.setAttribute('aria-label', boxLabel(dims));
    $('[data-box-caption]').textContent = `${inr0.format(dims.length)} × ${inr0.format(dims.width)} × ${inr0.format(dims.height)} mm (L × W × H)`;
  };

  const show = (sel: string, on: boolean) => ($(sel).hidden = !on);

  const update = () => {
    const s = read();
    // Shareable link first, so the WhatsApp / enquiry text carries the current one.
    const q = new URLSearchParams({ l: String(s.length), w: String(s.width), h: String(s.height), g: s.gradeId, p: s.print, q: String(s.qty) });
    if (s.pincode) q.set('pin', s.pincode);
    history.replaceState(null, '', `${location.pathname}?${q}`);
    drawBox();
    designer.setKind(s.print);
    designer.setBox(s.length, s.width, s.height);
    $('[data-print-note]').textContent =
      s.print === 'plain'
        ? 'Plain kraft box, no printing.'
        : `${s.print === 'one' ? 'One ink colour' : `Multicolour, up to ${s.colours} colours`}. Add your logo and text below and drag them where you want them. Plate cost is included in the price.`;
    const artText = designer.describe();
    const p = priceCustomBox(s, shop.rules);
    const grade = shop.rules.grades.find((g) => g.id === s.gradeId);
    const priced = shop.showPrices && p.ok;
    show('[data-ok]', priced);
    show('[data-bad]', shop.showPrices && !p.ok);
    show('[data-noprice]', !shop.showPrices);
    show('[data-slabs-card]', priced);

    let text = '';
    if (p.ok) {
      const weightTotal = p.weightKg * p.qty;
      $('[data-unit]').textContent = rs(p.unitPrice);
      $('[data-spec]').textContent = `BS ${p.box.bs} kg/cm² · ${inr0.format(p.box.weight)} g per box · ${inr0.format(weightTotal)} kg in total`;
      $('[data-qty-label]').textContent = `${inr0.format(p.qty)} boxes × ${rs(p.unitPrice)}`;
      $('[data-amount]').textContent = rs(p.amount);

      let delivery = 0;
      let deliveryText = 'Enter pincode';
      let note = '';
      if (/^\d{6}$/.test(s.pincode)) {
        const zone = findZone(shop.zones, s.pincode);
        if (!zone) {
          deliveryText = 'Ask us';
          note = "We don't deliver to this pincode online yet. Send an enquiry and we'll arrange transport.";
        } else {
          const c = deliveryCharge(zone, weightTotal, p.amount);
          if (c == null) {
            deliveryText = 'At checkout';
            note = `Courier to ${zone.name}, about ${zone.days} day${zone.days === 1 ? '' : 's'}. The courier charge is added at checkout.`;
          } else {
            delivery = c;
            deliveryText = c === 0 ? 'Free' : rs(c);
            note = zone.mode === 'pickup' ? 'Collect from our factory.' : `Our vehicle, ${zone.name}, about ${zone.days} day${zone.days === 1 ? '' : 's'}.`;
          }
        }
      }
      const t = checkoutTotals(p.amount, delivery, TAX_PCT);
      const zoneOk = /^\d{6}$/.test(s.pincode) && deliveryText !== 'Ask us' && deliveryText !== 'At checkout';
      canBuy = zoneOk && !(shop.minOrderValue > 0 && p.amount < shop.minOrderValue);
      $('[data-delivery]').textContent = deliveryText;
      $('[data-gst-label]').textContent = `GST ${TAX_PCT}%`;
      $('[data-gst]').textContent = rs(t.tax);
      $('[data-total]').textContent = rs(t.total);
      if (shop.minOrderValue > 0 && p.amount < shop.minOrderValue) note = `Minimum online order is ₹${inr0.format(shop.minOrderValue)} before GST. ${note}`;
      $('[data-delivery-note]').textContent = note;

      const current = slabFor(p.qty, shop.rules.slabs);
      $('[data-slabs]').innerHTML = slabTable(s, shop.rules)
        .map((r) => {
          const slab = slabFor(r.minQty, shop.rules.slabs);
          return `<tr aria-current="${slab && current && slab.minQty === current.minQty ? 'true' : 'false'}"><td>${inr0.format(r.minQty)}+ boxes</td><td>${rs(r.unitPrice)}</td></tr>`;
        })
        .join('');
      text = quoteText({ business, size: s, grade: grade ? grade.label || gradeLabel(grade) : '', colours: s.colours, qty: p.qty, unitPrice: shop.showPrices ? p.unitPrice : undefined, bs: p.box.bs, pincode: s.pincode, url: location.href, artwork: artText });
    } else {
      canBuy = false;
      $('[data-bad-msg]').textContent = p.message;
      text = quoteText({ business, size: s, grade: grade ? grade.label || gradeLabel(grade) : '', colours: s.colours, qty: s.qty, pincode: s.pincode, url: location.href, artwork: artText });
    }

    const buy = root.querySelector<HTMLButtonElement>('[data-buy]');
    if (buy) buy.hidden = !(canBuy && shop.showPrices && liveLoaded);
    const wa = root.querySelector<HTMLAnchorElement>('[data-wa-order]');
    if (wa && whatsapp) wa.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
    $<HTMLAnchorElement>('[data-enquiry-link]').href = `/contact/?details=${encodeURIComponent(text)}`;
  };

  // Turn the box: drag, arrow keys
  let drag: { x: number; y: number } | null = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view = { yaw: view.yaw + (e.clientX - drag.x) * 0.012, pitch: clampPitch(view.pitch + (e.clientY - drag.y) * 0.012) };
    drag = { x: e.clientX, y: e.clientY };
    drawBox();
  });
  const end = () => (drag = null);
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    const k: Record<string, [number, number]> = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] };
    const d = k[e.key];
    if (!d) return;
    e.preventDefault();
    view = { yaw: view.yaw + d[0], pitch: clampPitch(view.pitch + d[1]) };
    drawBox();
  });

  // Order & pay online: the server prices the box again, creates the order and opens Razorpay.
  root.querySelector<HTMLButtonElement>('[data-buy]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const note = $('[data-buy-msg]');
    const say = (t: string) => ((note.textContent = t), (note.hidden = !t));
    say('');
    btn.disabled = true;
    try {
      const [{ accessToken }, { callFn, pay }] = await Promise.all([import('../lib/account-api'), import('../lib/pay')]);
      const token = await accessToken();
      if (!token) {
        location.href = `/account/?return=${encodeURIComponent(location.pathname + location.search)}`;
        return;
      }
      const s = read();
      const artwork = designer.payload();
      const start = await callFn<import('../lib/pay').CheckoutStart>('checkout-custom', token, { ...s, ...(artwork ? { artwork } : {}) });
      designer.clear();
      const r = await pay(start, token);
      if (r.status === 'closed') say(`Order ${start.orderNumber} is saved in My orders. You can pay there when you are ready.`);
      else location.href = `/account/?paid=${encodeURIComponent(r.orderNumber)}`;
    } catch (err) {
      say(String((err as Error)?.message || err));
    } finally {
      btn.disabled = false;
    }
  });

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  fillGrades();
  update();

  if (root.dataset.live) {
    const list = await loadPriceList(liveConfig());
    shop = list.shop;
    liveLoaded = list.source === 'live';
    document.querySelectorAll<HTMLElement>('[data-sample-note]').forEach((n) => (n.hidden = list.source === 'live'));
    fillGrades();
    update();
  }
}
