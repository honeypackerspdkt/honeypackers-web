import { describe, expect, it, vi } from 'vitest';
import { priceCustomBox } from '@honeypackers/box-core/pricing';
import { defaultView } from '@honeypackers/box-core/box3d';
import { boxSvgInner, boxLabel } from '../src/lib/box-svg';
import { fromDb, loadPriceList, samplePriceList, type DeliveryZoneRow } from '../src/lib/price-list';
import { quoteText } from '../src/lib/quote-text';

describe('box-svg', () => {
  it('draws three visible faces, a seam, hidden edges and three dimension labels', () => {
    const svg = boxSvgInner({ length: 300, width: 200, height: 150 }, defaultView);
    expect(svg.match(/class="bx-face"/g)).toHaveLength(3);
    expect(svg.match(/class="bx-hidden"/g)).toHaveLength(3);
    expect(svg.match(/class="bx-seam"/g)).toHaveLength(1);
    expect([...svg.matchAll(/class="bx-label"[^>]*>([^<]+)</g)].map((m) => m[1]).sort()).toEqual(['H 150', 'L 300', 'W 200']);
    expect(svg).not.toContain('NaN');
  });
  it('can leave the dimensions out, and describes the box', () => {
    expect(boxSvgInner({ length: 1, width: 1, height: 1 }, defaultView, false)).not.toContain('bx-dim');
    expect(boxLabel({ length: 1200, width: 200, height: 150 })).toContain('1,200 by 200 by 150 mm');
  });
});

describe('price list', () => {
  const zone: DeliveryZoneRow = { id: 'z', name: 'Town', pincode_from: 622001, pincode_to: 622999, mode: 'own', rate_per_kg: '4.00', min_charge: '300.00', free_above: null, days: 1, active: true, sort: 0 };
  const sample = samplePriceList();

  it('sample list prices the example box', () => {
    expect(sample.source).toBe('sample');
    const p = priceCustomBox({ length: 300, width: 200, height: 150, gradeId: '3-120-18', qty: 100 }, sample.shop.rules);
    expect(p.ok && p.unitPrice).toBe(11.13); // same hand-worked number as box-core's pricing test
  });

  it('maps Supabase rows (numeric columns arrive as strings)', () => {
    const w = fromDb({ rules: sample.shop.rules, advance_pct: '100.00', min_order_value: '2000.00', show_prices: false }, [zone]);
    expect(w.advancePct).toBe(100);
    expect(w.minOrderValue).toBe(2000);
    expect(w.showPrices).toBe(false);
    expect(w.zones[0]).toMatchObject({ pincodeFrom: 622001, ratePerKg: 4, minCharge: 300, freeAbove: null });
  });

  it('loads live prices with the anon key, and falls back to the sample', async () => {
    const calls: string[] = [];
    const ok = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).apikey).toBe('anon');
      const body = url.includes('price_rules') ? [{ rules: sample.shop.rules, advance_pct: 100, min_order_value: 0, show_prices: true }] : [zone];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const live = await loadPriceList({ url: 'https://x.supabase.co/', anonKey: 'anon', orgId: 'org-1' }, ok);
    expect(live.source).toBe('live');
    expect(live.shop.zones).toHaveLength(1);
    expect(calls[0]).toBe('https://x.supabase.co/rest/v1/price_rules?org_id=eq.org-1&select=rules,advance_pct,min_order_value,show_prices');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    expect((await loadPriceList({ url: 'https://x', anonKey: 'a', orgId: 'o' }, down)).source).toBe('sample');
    const empty = (async () => new Response('[]', { status: 200 })) as unknown as typeof fetch;
    expect((await loadPriceList({ url: 'https://x', anonKey: 'a', orgId: 'o' }, empty)).source).toBe('sample');
    expect((await loadPriceList({})).source).toBe('sample');
    warn.mockRestore();
  });
});

describe('quote text', () => {
  it('lists the box, price and pincode', () => {
    const t = quoteText({ business: 'Honey Packers', size: { length: 300, width: 200, height: 150 }, grade: '3 ply · light', colours: 1, qty: 1000, unitPrice: 14.8, bs: 5.4, pincode: '600001', url: 'https://honeypackers.in/custom-box/?l=300' });
    expect(t).toBe(
      [
        "Hi Honey Packers, I'd like a quote for corrugated boxes:",
        '• Size: 300 × 200 × 150 mm (inside L × W × H)',
        '• Board: 3 ply · light (BS 5.4)',
        '• Printing: 1 colour',
        '• Quantity: 1,000 boxes',
        '• Website price: ₹14.80 per box + GST',
        '• Delivery pincode: 600001',
        '\nhttps://honeypackers.in/custom-box/?l=300',
      ].join('\n'),
    );
    expect(quoteText({ business: '', size: { length: 1, width: 2, height: 3 }, grade: '', colours: 0, qty: 5 })).not.toMatch(/Board|price|pincode/);
  });
});
