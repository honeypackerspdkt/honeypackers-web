import { describe, expect, it } from 'vitest';
import { priceCart } from '@honeypackers/box-core/pricing';
import { calcBox } from '@honeypackers/box-core/calc';
import { addToCart, cartCount, productFromRow, sampleProducts } from '../src/lib/products';

describe('products on the website', () => {
  it('maps database rows (numbers as strings, bad packs dropped)', () => {
    const p = productFromRow({ id: 'x', name: 'Box', ply: '5', spec: { length: 1, width: 1, height: 1, ply: 5, perLayer: false, layers: [] }, packs: [{ qty: '10', price: '520.00' }, { qty: 0, price: 5 }], tax_pct: '5.00', stock_qty: '300', active: true });
    expect(p).toMatchObject({ ply: 5, packs: [{ qty: 10, price: 520 }], taxPct: 5, stockQty: 300 });
    expect(productFromRow({ id: 'y', packs: [] }).stockQty).toBeNull();
  });

  it('sample products work with the shared cart maths (same-paper layers use the first one)', () => {
    const products = sampleProducts();
    expect(products).toHaveLength(3);
    expect(calcBox(products[1].spec).weight).toBe(158.51); // same board as the hand-worked example
    const c = priceCart([{ productId: 'sample-3ply-medium', packQty: 100, count: 2 }], products);
    expect([c.goods, c.weightKg]).toEqual([3200, 31.702]);
  });

  it('combines the same pack in the cart', () => {
    let cart = addToCart([], { productId: 'a', packQty: 25, count: 1 });
    cart = addToCart(cart, { productId: 'a', packQty: 25, count: 2 });
    cart = addToCart(cart, { productId: 'a', packQty: 100, count: 1 });
    expect(cart).toEqual([{ productId: 'a', packQty: 25, count: 3 }, { productId: 'a', packQty: 100, count: 1 }]);
    expect(cartCount(cart)).toBe(4);
  });
});
