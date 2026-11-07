// Netlify Forms → Supabase `enquiries`, so website enquiries show up in the BoxBook app's Inbox.
// Netlify calls the `submission-created` function after a form submission passed its spam filter.
import type { ShopEnv } from './shop';

type Row = Record<string, unknown>;
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** The enquiries row for a Netlify "submission-created" event body, or null when it is not our enquiry form. */
export function enquiryRow(eventBody: string, orgId: string): Row | null {
  let body: { payload?: { form_name?: string; data?: Row; created_at?: string } };
  try {
    body = JSON.parse(eventBody);
  } catch {
    return null;
  }
  const p = body.payload;
  if (!p || p.form_name !== 'enquiry' || !p.data) return null;
  const d = p.data;
  if (clip(d.company_website, 200)) return null; // honeypot filled: a bot
  const extra = [d.company && `Company: ${clip(d.company, 120)}`, d.pincode && `Pincode: ${clip(d.pincode, 6)}`].filter(Boolean).join('\n');
  const message = [clip(d.details, 2000), extra].filter(Boolean).join('\n\n');
  const phone = clip(d.phone, 20);
  if (!clip(d.name, 80) && !phone) return null;
  return {
    org_id: orgId,
    name: clip(d.name, 80),
    phone,
    email: clip(d.email, 120),
    message,
    page: clip(d.subject, 80) || 'contact',
    consent: d.consent === 'yes' || d.consent === 'on' || d.consent === true,
  };
}

export async function saveEnquiry(env: Pick<ShopEnv, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SHOP_ORG_ID'>, eventBody: string, fetcher: typeof fetch = fetch): Promise<{ saved: boolean; reason?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SHOP_ORG_ID) return { saved: false, reason: 'not configured' };
  const row = enquiryRow(eventBody, env.SHOP_ORG_ID);
  if (!row) return { saved: false, reason: 'not an enquiry' };
  const r = await fetcher(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/enquiries`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Saving the enquiry failed: ${r.status} ${await r.text().catch(() => '')}`);
  return { saved: true };
}
