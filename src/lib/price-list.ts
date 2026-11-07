import { normalizeWebShop, type DeliveryZone, type WebShop } from '@honeypackers/box-core/pricing';
import sample from '../data/sample-price-list.json';

/**
 * Where the website's prices come from.
 * - Live: the BoxBook web price list in Supabase (price_rules + delivery_zones, readable with the anon key).
 * - Sample: src/data/sample-price-list.json while Supabase is not set up; the pages then say "sample prices".
 */
export interface PriceList {
  shop: WebShop;
  source: 'live' | 'sample';
}

/** Supabase rows → WebShop. */
export interface PriceRulesRow {
  rules: unknown;
  advance_pct: number | string;
  min_order_value: number | string;
  show_prices: boolean;
}
export interface DeliveryZoneRow {
  id: string;
  name: string;
  pincode_from: number;
  pincode_to: number;
  mode: DeliveryZone['mode'];
  rate_per_kg: number | string;
  min_charge: number | string;
  free_above: number | string | null;
  days: number;
  active: boolean;
  sort: number;
}

const n = (v: number | string | null | undefined) => (v == null || v === '' ? 0 : Number(v)); // numeric columns arrive as strings

export function fromDb(rules: PriceRulesRow, zones: DeliveryZoneRow[]): WebShop {
  return normalizeWebShop({
    rules: rules.rules,
    advancePct: n(rules.advance_pct),
    minOrderValue: n(rules.min_order_value),
    showPrices: rules.show_prices,
    zones: zones.map(
      (z): DeliveryZone => ({
        id: z.id,
        name: z.name,
        pincodeFrom: z.pincode_from,
        pincodeTo: z.pincode_to,
        mode: z.mode,
        ratePerKg: n(z.rate_per_kg),
        minCharge: n(z.min_charge),
        freeAbove: z.free_above == null ? null : n(z.free_above),
        days: z.days,
        active: z.active,
        sort: z.sort,
      }),
    ),
  });
}

export function samplePriceList(): PriceList {
  return { shop: normalizeWebShop(sample), source: 'sample' };
}

interface LiveConfig {
  url?: string;
  anonKey?: string;
  orgId?: string;
}

/** Live price list from Supabase, or the sample when not configured / not reachable. */
export async function loadPriceList(cfg: LiveConfig, fetcher: typeof fetch = fetch): Promise<PriceList> {
  const { url, anonKey, orgId } = cfg;
  if (!url || !anonKey || !orgId) return samplePriceList();
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const base = url.replace(/\/+$/, '') + '/rest/v1';
  const org = encodeURIComponent(orgId);
  try {
    const [r, z] = await Promise.all([
      fetcher(`${base}/price_rules?org_id=eq.${org}&select=rules,advance_pct,min_order_value,show_prices`, { headers }),
      fetcher(`${base}/delivery_zones?org_id=eq.${org}&active=eq.true&deleted_at=is.null&order=sort&select=*`, { headers }),
    ]);
    if (!r.ok || !z.ok) throw new Error(`Supabase ${r.status}/${z.status}`);
    const [rows, zones] = (await Promise.all([r.json(), z.json()])) as [PriceRulesRow[], DeliveryZoneRow[]];
    if (!rows[0]) throw new Error('no price_rules row for this organisation');
    return { shop: fromDb(rows[0], zones), source: 'live' };
  } catch (e) {
    console.warn('[price-list] falling back to sample prices:', e);
    return samplePriceList();
  }
}

export const liveConfig = (): LiveConfig => ({
  url: import.meta.env.PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  orgId: import.meta.env.PUBLIC_SHOP_ORG_ID,
});
