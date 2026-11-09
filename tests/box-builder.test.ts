import { describe, expect, it } from 'vitest';
import { priceCustomBox } from '@honeypackers/box-core/pricing';
import { samplePriceList } from '../src/lib/price-list';
import { builderResult, builderText, gradesFor, toMm, type BuilderInput } from '../src/lib/box-builder';

const shop = samplePriceList().shop;
const base: BuilderInput = { style: 'rsc', unit: 'mm', l: 300, w: 200, h: 150, gradeId: '5-150-120', colours: 0, qty: 500 };

describe('home box builder', () => {
  it('prices an RSC exactly like box-core and links to the order page', () => {
    const r = builderResult(base, shop);
    const core = priceCustomBox({ length: 300, width: 200, height: 150, gradeId: '5-150-120', qty: 500, colours: 0 }, shop.rules);
    expect(r.kind).toBe('price');
    if (r.kind !== 'price' || !core.ok) throw new Error('no price');
    expect(r.unitPrice).toBe(core.unitPrice);
    expect(r.amount).toBe(core.amount);
    expect(r.orderHref).toBe('/custom-box/?l=300&w=200&h=150&g=5-150-120&c=0&q=500');
  });
  it('turns inches into mm before pricing', () => {
    expect(toMm(11.8, 'in')).toBe(300);
    const r = builderResult({ ...base, unit: 'in', l: 11.8, w: 7.9, h: 5.9 }, shop);
    expect(r.kind === 'price' && r.orderHref).toContain('l=300&w=201&h=150');
  });
  it('sends die-cut boxes, hidden prices and problems to a quote', () => {
    expect(builderResult({ ...base, style: 'diecut' }, shop).kind).toBe('quote');
    expect(builderResult(base, { ...shop, showPrices: false }).kind).toBe('quote');
    const low = builderResult({ ...base, qty: 10 }, shop);
    expect(low).toEqual({ kind: 'quote', message: 'Minimum order is 100 boxes.' });
  });
  it('lists grades by ply and writes the enquiry text', () => {
    expect(gradesFor(shop, 3).map((g) => g.id)).toEqual(['3-120-18', '3-150-20']);
    const t = builderText({ ...base, colours: 2 }, shop, builderResult({ ...base, colours: 2 }, shop));
    expect(t).toContain('Inside size: 300 × 200 × 150 mm');
    expect(t).toContain('Printing: 2 colours');
    expect(t).toMatch(/Website price: ₹\d+\.\d\d a box \+ GST/);
  });
});
