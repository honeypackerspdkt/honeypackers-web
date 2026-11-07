import type { Product } from '@honeypackers/box-core/types';
import type { WebShop } from '@honeypackers/box-core/pricing';
import { liveConfig, loadPriceList } from './price-list';
import { loadProducts } from './products';

/** Products and the price list, loaded once per page and shared by the header cart, shop, product page and checkout. */
let products: Promise<{ products: Product[]; source: 'live' | 'sample' }> | null = null;
let prices: Promise<{ shop: WebShop; source: 'live' | 'sample' }> | null = null;
export const catalog = () => (products ??= loadProducts(liveConfig()));
export const priceList = () => (prices ??= loadPriceList(liveConfig()));

/** Where a product's page is: a page made at build time, or the page that loads any product by slug. */
export const productHref = (p: Pick<Product, 'slug' | 'id'>, built: Set<string>) =>
  built.has(p.slug) ? `/products/${p.slug}/` : `/product/?p=${encodeURIComponent(p.slug || p.id)}`;

/** Lowest price per box across a product's packs (for "from ₹x / box"). */
export const fromPrice = (p: Product) => Math.min(...p.packs.map((k) => k.price / k.qty));
