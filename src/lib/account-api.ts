import type { SupabaseClient } from '@supabase/supabase-js';
import { customerFromRow, ordersFromRows } from './account';

/**
 * Buyer sign-in and data (Supabase). Mobile number + SMS code: Supabase creates the code and BoxBook's
 * send-sms-msg91 hook delivers it through MSG91. Row-level security limits a buyer to their own records.
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

export async function sendCode(mobile10: string) {
  const { error } = await (await sb()).auth.signInWithOtp({ phone: `+91${mobile10}`, options: { shouldCreateUser: true } });
  if (error) fail(error);
}

export async function verifyCode(mobile10: string, code: string) {
  const { error } = await (await sb()).auth.verifyOtp({ phone: `+91${mobile10}`, token: code, type: 'sms' });
  if (error) fail(error);
}

export async function signedInPhone(): Promise<string | null> {
  const { data } = await (await sb()).auth.getSession();
  return data.session?.user?.phone ? `+${data.session.user.phone.replace(/^\+/, '')}` : null;
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
