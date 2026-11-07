import { calcBox } from '@honeypackers/box-core/calc';
import { defaultView } from '@honeypackers/box-core/box3d';
import type { Product } from '@honeypackers/box-core/types';
import { BOX_H, BOX_W, boxSvgInner } from './box-svg';

/** HTML for one product card (used at build time and again in the browser with live prices). */
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `₹${inr.format(n)}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function productCard(p: Product): string {
  const r = calcBox(p.spec);
  const packs = p.packs
    .map(
      (k, i) => `<label><input type="radio" name="pack-${esc(p.id)}" value="${k.qty}" ${i === 0 ? 'checked' : ''} />
        <span><b>${k.qty.toLocaleString('en-IN')} boxes</b>&nbsp;· ${rs(k.price)} <small>(${rs(k.price / k.qty)} each)</small></span></label>`,
    )
    .join('');
  const stock = p.stockQty == null ? 'Made to order' : p.stockQty > 0 ? `${p.stockQty.toLocaleString('en-IN')} in stock` : 'Out of stock';
  const out = p.stockQty != null && p.stockQty <= 0;
  return `<article class="card product" data-product="${esc(p.id)}" id="${esc(p.slug || p.id)}">
    <div class="box3d product__box"><svg viewBox="0 0 ${BOX_W} ${BOX_H}" aria-hidden="true">${boxSvgInner({ length: p.spec.length, width: p.spec.width, height: p.spec.height }, defaultView)}</svg></div>
    <h2 class="product__name">${esc(p.name)}</h2>
    <p class="spec-line">${p.spec.length}×${p.spec.width}×${p.spec.height} mm inside · ${p.ply} ply · BS ${r.bs} kg/cm² · ${Math.round(r.weight)} g · <span class="${out ? '' : 'muted'}">${stock}</span></p>
    ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ''}
    <div class="chips chips--stack" role="radiogroup" aria-label="Pack size">${packs}</div>
    <div class="product__buy">
      <label class="field product__count"><span class="visually-hidden">Number of packs</span><span class="input-unit"><input type="number" inputmode="numeric" min="1" max="1000" value="1" data-count /><em>packs</em></span></label>
      <button class="btn btn--primary" type="button" data-add ${out ? 'disabled' : ''}>Add to cart</button>
    </div>
    <p class="small muted" style="margin:6px 0 0">Prices before GST (5%). Delivery worked out in the cart.</p>
  </article>`;
}
