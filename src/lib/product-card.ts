import { calcBox } from '@honeypackers/box-core/calc';
import { defaultView } from '@honeypackers/box-core/box3d';
import type { Product } from '@honeypackers/box-core/types';
import { BOX_H, BOX_W, boxSvgInner } from './box-svg';
import { fromPrice } from './catalog';

/** Shop tile for a product (built at build time and again in the browser with live data). */
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rs = (n: number) => `₹${inr.format(n)}`;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function stockText(p: Product): { text: string; cls: string; out: boolean } {
  if (p.stockQty == null) return { text: 'Made to order', cls: 'muted', out: false };
  // owner's choice: out of stock still sells, made to order
  if (p.stockQty <= 0) return { text: `Out of stock: made to order in about ${p.madeDays || 7} days`, cls: 'stock-low', out: false };
  if (p.stockQty < (p.packs[0]?.qty || 0) * 3) return { text: `Only ${p.stockQty.toLocaleString('en-IN')} in stock, more made to order`, cls: 'stock-low', out: false };
  return { text: `${p.stockQty.toLocaleString('en-IN')} in stock, ready to ship`, cls: 'stock-ok', out: false };
}

export function productTile(p: Product, href: string): string {
  const r = calcBox(p.spec);
  const st = stockText(p);
  const opts = p.packs.map((k) => `<option value="${k.qty}">${k.qty.toLocaleString('en-IN')} boxes · ${rs(k.price)}</option>`).join('');
  return `<article class="tile" data-product="${esc(p.id)}">
    <a class="tile__media" href="${href}" aria-label="${esc(p.name)}">
      <svg viewBox="0 0 ${BOX_W} ${BOX_H}" aria-hidden="true" class="box3d">${boxSvgInner({ length: p.spec.length, width: p.spec.width, height: p.spec.height }, defaultView, false)}</svg>
      <span class="tile__tag">${p.ply} ply</span>
      ${st.cls === 'stock-low' ? `<span class="tile__tag tile__tag--stock">${esc(st.text)}</span>` : ''}
    </a>
    <div class="tile__body">
      <a class="tile__name" href="${href}">${esc(p.name)}</a>
      <span class="tile__spec">${p.spec.length}×${p.spec.width}×${p.spec.height} mm · BS ${r.bs}</span>
      <span class="tile__price">from ${rs(fromPrice(p))} <small>/ box</small></span>
      <div class="tile__buy">
        <select data-pack aria-label="Pack size">${opts}</select>
        <button class="btn btn--primary btn--sm" type="button" data-add ${st.out ? 'disabled' : ''}>${st.out ? 'Sold out' : 'Add'}</button>
      </div>
    </div>
  </article>`;
}
