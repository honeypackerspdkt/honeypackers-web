import { calcBox, layerName } from '@honeypackers/box-core/calc';
import { clampPitch, defaultView, type View } from '@honeypackers/box-core/box3d';
import { deliveryCharge, findZone } from '@honeypackers/box-core/pricing';
import type { Product } from '@honeypackers/box-core/types';
import { BOX_H, BOX_W, boxLabel, boxSvgInner } from './box-svg';
import { liveCarton } from './carton-live';
import { esc, rs, stockText } from './product-card';
import { icon } from './icons';

/** Product page body (same HTML at build time and in the browser). */
export function productPageHtml(p: Product): string {
  const r = calcBox(p.spec);
  const st = stockText(p);
  const dims = { length: p.spec.length, width: p.spec.width, height: p.spec.height };
  const layers = p.spec.perLayer ? p.spec.layers.slice(0, p.ply) : [p.spec.layers[0]];
  const board = layers.every((l) => l && l.gsm === layers[0]?.gsm && l.bf === layers[0]?.bf)
    ? `${layers[0]?.gsm} GSM · ${layers[0]?.bf} BF, all layers`
    : layers.map((l, i) => `${layerName(i, p.ply)}: ${l.gsm}/${l.bf}`).join(', ');
  const first = p.packs[0];
  const packs = p.packs
    .map(
      (k, i) => `<label class="pack"><input type="radio" name="pack" value="${k.qty}" ${i === 0 ? 'checked' : ''} />
        <span><strong>${k.qty.toLocaleString('en-IN')} boxes</strong><br><span class="small muted">${rs(k.price / k.qty)} per box</span></span>
        <span class="pack__price">${rs(k.price)}<small>per pack</small></span></label>`,
    )
    .join('');
  const custom = `/custom-box/?l=${p.spec.length}&w=${p.spec.width}&h=${p.spec.height}`;
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/shop/">Shop</a> › <a href="/shop/?ply=${p.ply}">${p.ply} ply</a> › ${esc(p.name)}</nav>
  <div class="pdp">
    <div class="pdp__media box3d">
      <svg viewBox="0 0 ${BOX_W} ${BOX_H}" role="img" tabindex="0" aria-label="${esc(boxLabel(dims))}" data-box>${boxSvgInner(dims, defaultView)}</svg>
      <div class="box3d__caption"><span>${dims.length} × ${dims.width} × ${dims.height} mm (inside L × W × H)</span><span>Drag to turn</span></div>
    </div>
    <div>
      <span class="tag">${p.ply} ply corrugated</span>
      <h1 class="pdp__title">${esc(p.name)}</h1>
      <p class="${st.cls}" style="margin:0">${esc(st.text)}</p>
      <p class="pdp__price" data-price>${first ? rs(first.price / first.qty) : ''} <small>per box + GST</small></p>
      <p class="small muted" data-pack-line style="margin:0">${first ? `${rs(first.price)} for a pack of ${first.qty}` : ''}</p>
      <div class="packs" role="radiogroup" aria-label="Pack size">${packs}</div>
      <div class="pdp__buy">
        <div class="qty"><button type="button" data-q="-1" aria-label="One pack less">${icon.minus(16)}</button><input type="number" inputmode="numeric" min="1" max="1000" value="1" aria-label="Number of packs" data-count /><button type="button" data-q="1" aria-label="One pack more">${icon.plus(16)}</button></div>
        <button class="btn btn--ghost" type="button" data-add ${st.out ? 'disabled' : ''}>Add to cart</button>
        <button class="btn btn--primary btn--buynow" type="button" data-buy ${st.out ? 'disabled' : ''}>Buy now</button>
      </div>
      <p class="small muted" data-total-line style="margin:8px 0 0"></p>
      <div class="card" style="margin-top:18px;padding:16px">
        <label class="field"><span>${icon.truck(18)} Check delivery</span>
          <span class="deliv"><input class="input" inputmode="numeric" maxlength="6" placeholder="Pincode" data-pin autocomplete="postal-code" /></span>
        </label>
        <p class="small" data-deliv style="margin:8px 0 0"></p>
      </div>
      <h2 style="font-size:1.15rem;margin:24px 0 6px">Specifications</h2>
      <table class="specs">
        <tr><th>Inside size (L × W × H)</th><td>${dims.length} × ${dims.width} × ${dims.height} mm</td></tr>
        <tr><th>Ply</th><td>${p.ply} ply</td></tr>
        <tr><th>Board</th><td>${esc(board)}</td></tr>
        <tr><th>Bursting strength (BS)</th><td>${r.bs} kg/cm²</td></tr>
        <tr><th>Weight per box</th><td>${Math.round(r.weight)} g</td></tr>
        <tr><th>Board sheet</th><td>${r.cutSize} × ${r.deckleSize} mm${r.sheets > 1 ? ' (2 sheets)' : ''}</td></tr>
        <tr><th>HSN · GST</th><td>${esc(p.hsn)} · ${p.taxPct}%</td></tr>
      </table>
      ${p.description ? `<p style="margin-top:16px">${esc(p.description)}</p>` : ''}
      <p class="small" style="margin-top:16px">Need printing with your logo, or a slightly different size? <a href="${custom}">Price a custom box</a>.</p>
    </div>
  </div>`;
}

export interface ProductPageDeps {
  zones?: () => Promise<{ zones: import('@honeypackers/box-core/pricing').DeliveryZone[]; ready: boolean }>;
  add: (productId: string, packQty: number, count: number, thenCheckout: boolean) => void;
}

/** Makes a rendered product page interactive. */
export function initProductPage(root: HTMLElement, p: Product, deps: ProductPageDeps) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const countInput = $<HTMLInputElement>('[data-count]');
  const pack = () => p.packs.find((k) => String(k.qty) === root.querySelector<HTMLInputElement>('input[name=pack]:checked')?.value) || p.packs[0];
  const count = () => Math.max(1, Math.min(1000, Math.floor(Number(countInput.value) || 1)));
  const perBoxKg = calcBox(p.spec).weight / 1000;

  const update = () => {
    const k = pack();
    if (!k) return;
    const n = count();
    $('[data-price]').innerHTML = `${rs(k.price / k.qty)} <small>per box + GST</small>`;
    $('[data-pack-line]').textContent = `${rs(k.price)} for a pack of ${k.qty}`;
    $('[data-total-line]').textContent = `${n} pack${n > 1 ? 's' : ''} = ${(k.qty * n).toLocaleString('en-IN')} boxes · ${rs(k.price * n)} + GST`;
    void checkDelivery();
  };

  const checkDelivery = async () => {
    const out = $('[data-deliv]');
    const pin = $<HTMLInputElement>('[data-pin]').value.replace(/\D/g, '');
    if (pin.length !== 6 || !deps.zones) return void (out.textContent = '');
    try {
      localStorage.setItem('hp-pincode', pin);
    } catch {
      /* ignore */
    }
    const { zones } = await deps.zones();
    const z = findZone(zones, pin);
    const k = pack();
    if (!z) return void (out.innerHTML = 'We don’t deliver to this pincode online yet. <a href="/contact/">Send an enquiry</a>.');
    const charge = deliveryCharge(z, perBoxKg * k.qty * count(), k.price * count());
    out.innerHTML =
      charge == null
        ? `Courier to ${esc(z.name)}: priced by enquiry for now.`
        : `<span class="stock-ok">Delivers to ${esc(z.name)}</span> in about ${z.days} day${z.days === 1 ? '' : 's'} · ${charge === 0 ? 'free delivery' : `delivery ${rs(charge)}`}${z.mode === 'pickup' ? ' (collect from our factory)' : ''}`;
  };

  root.addEventListener('change', (e) => ((e.target as HTMLElement).matches('input[name=pack]') ? update() : undefined));
  countInput.addEventListener('input', update);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const step = t.closest<HTMLElement>('[data-q]');
    if (step) {
      countInput.value = String(Math.max(1, Math.min(1000, count() + Number(step.dataset.q))));
      update();
    }
    if (t.closest('[data-add]')) deps.add(p.id, pack().qty, count(), false);
    if (t.closest('[data-buy]')) deps.add(p.id, pack().qty, count(), true);
  });
  const pinInput = $<HTMLInputElement>('[data-pin]');
  try {
    pinInput.value = localStorage.getItem('hp-pincode') || '';
  } catch {
    /* ignore */
  }
  pinInput.addEventListener('input', () => void checkDelivery());

  // turn the 3D box
  const svg = $<SVGSVGElement>('[data-box]');
  const dims = { length: p.spec.length, width: p.spec.width, height: p.spec.height };
  let view: View = { ...defaultView };
  let drag: { x: number; y: number } | null = null;
  const draw = () => {
    svg.innerHTML = boxSvgInner(dims, view, true, {}, live.on);
    live.set(dims, view);
  };
  const live = liveCarton(svg, draw);
  svg.addEventListener('pointerdown', (e) => (svg.setPointerCapture(e.pointerId), (drag = { x: e.clientX, y: e.clientY })));
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view = { yaw: view.yaw + (e.clientX - drag.x) * 0.012, pitch: clampPitch(view.pitch + (e.clientY - drag.y) * 0.012) };
    drag = { x: e.clientX, y: e.clientY };
    draw();
  });
  svg.addEventListener('pointerup', () => (drag = null));
  svg.addEventListener('pointercancel', () => (drag = null));
  svg.addEventListener('keydown', (e) => {
    const d = ({ ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    view = { yaw: view.yaw + d[0], pitch: clampPitch(view.pitch + d[1]) };
    draw();
  });
  update();
}

/** schema.org Product with an offer range, for search results. */
export function productJsonLd(p: Product, url: string, brandName: string) {
  const per = p.packs.map((k) => k.price);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description || `${p.ply} ply corrugated box, ${p.spec.length}×${p.spec.width}×${p.spec.height} mm inside`,
    sku: p.slug,
    brand: { '@type': 'Brand', name: brandName },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: Math.min(...per).toFixed(2),
      highPrice: Math.max(...per).toFixed(2),
      offerCount: p.packs.length,
      availability: p.stockQty != null && p.stockQty <= 0 ? 'https://schema.org/BackOrder' : 'https://schema.org/InStock',
      url,
    },
  };
}
