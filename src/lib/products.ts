import type { CartLine } from '@honeypackers/box-core/pricing';
import type { Product } from '@honeypackers/box-core/types';
import sample from '../data/sample-products.json';

/** Standard boxes sold in packs: Supabase `products` rows (public) or the sample list, and the browser cart. */
type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

export function productFromRow(r: Row): Product {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ''),
    name: String(r.name ?? ''),
    description: String(r.description ?? ''),
    ply: (num(r.ply) || 3) as Product['ply'],
    spec: r.spec as Product['spec'],
    packs: Array.isArray(r.packs) ? (r.packs as Row[]).map((k) => ({ qty: num(k.qty), price: num(k.price) })).filter((k) => k.qty > 0 && k.price > 0) : [],
    hsn: String(r.hsn ?? '48191010'),
    taxPct: num(r.tax_pct ?? r.taxPct ?? 5),
    stockQty: r.stock_qty == null && r.stockQty == null ? null : num(r.stock_qty ?? r.stockQty),
    photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
    active: r.active !== false,
    sort: num(r.sort),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

export const sampleProducts = (): Product[] => (sample.products as Row[]).map(productFromRow);

export async function loadProducts(cfg: { url?: string; anonKey?: string; orgId?: string }, fetcher: typeof fetch = fetch): Promise<{ products: Product[]; source: 'live' | 'sample' }> {
  if (!cfg.url || !cfg.anonKey || !cfg.orgId) return { products: sampleProducts(), source: 'sample' };
  try {
    const r = await fetcher(`${cfg.url.replace(/\/+$/, '')}/rest/v1/products?org_id=eq.${encodeURIComponent(cfg.orgId)}&active=eq.true&deleted_at=is.null&order=sort,name&select=*`, {
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${cfg.anonKey}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    return { products: ((await r.json()) as Row[]).map(productFromRow).filter((p) => p.packs.length > 0), source: 'live' };
  } catch (e) {
    console.warn('[products] falling back to sample', e);
    return { products: sampleProducts(), source: 'sample' };
  }
}

/* ───────── cart (this browser only) ───────── */

const KEY = 'hp-cart';

export function readCart(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((l) => l && typeof l.productId === 'string' && l.packQty > 0 && l.count > 0) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* private mode: the cart lasts until the page closes */
  }
  window.dispatchEvent(new CustomEvent('cart-change'));
}

/** Adds packs to the cart (same product and pack size are combined). */
export function addToCart(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.productId === line.productId && l.packQty === line.packQty);
  if (i < 0) return [...lines, line];
  return lines.map((l, j) => (j === i ? { ...l, count: Math.min(1000, l.count + line.count) } : l));
}

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.count, 0);
