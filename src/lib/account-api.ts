import type { SupabaseClient } from '@supabase/supabase-js';
import { customerFromRow, ordersFromRows } from './account';

/**
 * Buyer sign-in and data (Supabase). Mobile number + code on WhatsApp (Supabase creates the code; the
 * send-otp-whatsapp hook delivers it through Meta's Cloud API), or e-mail + code/link (Supabase's mailer).
 * Row-level security limits a buyer to their own records.
 */
const env = import.meta.env;
const url = (env.PUBLIC_SUPABASE_URL || '').trim();
const key = (env.PUBLIC_SUPABASE_ANON_KEY || '').trim();
export const orgId = (env.PUBLIC_SHOP_ORG_ID || '').trim();
export const accountsEnabled = Boolean(url && key && orgId);

let client: Promise<SupabaseClient> | null = null;
/** Loaded only on the account page, and only when accounts are set up. */
export function sb(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }));
  return client;
}

const fail = (e: { message?: string } | null) => {
  throw new Error(e?.message || 'Something went wrong');
};

/** Where the sign-in code goes: WhatsApp to an Indian mobile number, or e-mail. */
export type SignInTarget = { via: 'wa'; mobile: string } | { via: 'email'; email: string };

export async function sendCode(t: SignInTarget) {
  const auth = (await sb()).auth;
  const { error } =
    t.via === 'wa'
      ? await auth.signInWithOtp({ phone: `+91${t.mobile}`, options: { shouldCreateUser: true } })
      : // the e-mail carries a link back to this page and (with a custom mail sender) the 6-digit code
        await auth.signInWithOtp({ email: t.email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  if (error) fail(error);
}

export async function verifyCode(t: SignInTarget, code: string) {
  const auth = (await sb()).auth;
  const { error } = t.via === 'wa' ? await auth.verifyOtp({ phone: `+91${t.mobile}`, token: code, type: 'sms' }) : await auth.verifyOtp({ email: t.email, token: code, type: 'email' });
  if (error) fail(error);
}

/** Who is signed in: their mobile (+91…) and/or e-mail; null when signed out. */
export async function signedIn(): Promise<{ phone: string; email: string } | null> {
  const { data } = await (await sb()).auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return { phone: u.phone ? `+${u.phone.replace(/^\+/, '')}` : '', email: u.email || '' };
}

/** Access token for our server functions (payments). */
export async function accessToken(): Promise<string | null> {
  const { data } = await (await sb()).auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut() {
  await (await sb()).auth.signOut();
}

export interface Profile {
  name?: string;
  company?: string;
  email?: string;
  gstin?: string;
  address?: string;
  stateCode?: string;
  /** Mobile number for delivery (buyers who signed in by e-mail). */
  phone?: string;
}

/**
 * Link this login to the business's customer record (an existing customer with the same mobile number is
 * found automatically) and update the details given. Returns the customer.
 */
export async function link(p: Profile = {}) {
  const c = await sb();
  const { data: id, error } = await c.rpc('buyer_link', {
    p_org: orgId,
    p_name: p.name ?? null,
    p_company: p.company ?? null,
    p_email: p.email ?? null,
    p_gstin: p.gstin ?? null,
    p_address: p.address ?? null,
    p_state_code: p.stateCode ?? null,
    p_phone: p.phone ?? null,
  });
  if (error) fail(error);
  const { data, error: e2 } = await c.from('customers').select('*').eq('id', id as string).single();
  if (e2) fail(e2);
  return customerFromRow(data);
}

export async function myOrders() {
  const c = await sb();
  const [o, i, p, b] = await Promise.all([
    c.from('orders').select('*').eq('org_id', orgId).order('date', { ascending: false }),
    c.from('order_items').select('*').eq('org_id', orgId),
    c.from('payments').select('*').eq('org_id', orgId),
    c.from('public_business').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  for (const r of [o, i, p]) if (r.error) fail(r.error);
  return { orders: ordersFromRows(o.data || [], i.data || [], p.data || []), business: b.data };
}
