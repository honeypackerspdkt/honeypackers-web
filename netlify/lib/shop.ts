// Server side of online payment (Razorpay) for honeypackers.in, used by the Netlify functions in netlify/functions.
// Prices and amounts are always worked out here (box-core), never taken from the browser.
// Pure apart from the injected fetch, so it is tested with fake Supabase / Razorpay (tests/shop.test.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { advanceAmount, checkoutTotals, deliveryCharge, findZone, gradeLabel, priceCart, priceCustomBox, type CartLine, type WebShop } from '../../packages/box-core/src/pricing';
import { defaultCompany } from '../../packages/box-core/src/company';
import { cleanArtwork, printColours, printKindOf, printLabel } from '../../packages/box-core/src/artwork';
import type { BoxSpec, PrintKind } from '../../packages/box-core/src/types';
import { orderView, ordersFromRows } from '../../src/lib/account';
import { fromDb, type DeliveryZoneRow, type PriceRulesRow } from '../../src/lib/price-list';
import { productFromRow } from '../../src/lib/products';

export interface ShopEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SHOP_ORG_ID: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  BUSINESS_NAME?: string;
}

export interface ShopDeps {
  env: ShopEnv;
  fetch: typeof fetch;
  log?: (m: string) => void;
}

type Row = Record<string, unknown>;
const TAX_PCT = defaultCompany.defaults.taxPct; // 5% (HSN 4819)
const OFFICE = ['Administrator', 'Sales', 'Accounts'];
const RZP = 'https://api.razorpay.com/v1';

/* ─────────────── responses ─────────────── */

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown, cors = false) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(cors ? CORS : {}) } });
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function bad(status: number, message: string): never {
  throw new HttpError(status, message);
}

/* ─────────────── signatures ─────────────── */

export const hmacHex = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Checkout result: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export const checkoutSignatureOk = (orderId: string, paymentId: string, signature: string, keySecret: string) => safeEqual(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
/** Webhook: HMAC-SHA256(raw body, webhook secret) in X-Razorpay-Signature. */
export const webhookSignatureOk = (rawBody: string, signature: string, webhookSecret: string) => !!signature && safeEqual(hmacHex(webhookSecret, rawBody), signature);

/** The captured payment and our order it belongs to, from a webhook event (null for events we do not use). */
export function paymentFromEvent(e: Row): { paymentId: string; amount: number; rzpOrderId: string | null; orderId: string; orgId: string } | null {
  if (!['order.paid', 'payment_link.paid', 'payment.captured'].includes(String(e.event))) return null;
  const p = (e.payload || {}) as Record<string, { entity?: Row }>;
  const pay = p.payment?.entity;
  if (!pay || (pay.status && pay.status !== 'captured')) return null;
  const notes = ((p.payment_link?.entity?.notes || p.order?.entity?.notes || pay.notes || {}) as Row) || {};
  const orderId = String(notes.order_id || '');
  const orgId = String(notes.org_id || '');
  if (!orderId || !orgId) return null;
  return { paymentId: String(pay.id), amount: Number(pay.amount) / 100, rzpOrderId: pay.order_id ? String(pay.order_id) : null, orderId, orgId };
}

/* ─────────────── artwork files ─────────────── */

const MAX_IMAGE = 2 * 1024 * 1024;
/** A PNG / JPEG / WebP data URL from the browser → bytes (null when missing, an error when not an allowed image). */
export function imageFromDataUrl(v: unknown): { bytes: Uint8Array; type: string; ext: string } | null {
  if (v == null || v === '') return null;
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(v));
  if (!m) bad(400, 'The logo must be a PNG, JPG or WebP picture.');
  const bytes = Uint8Array.from(Buffer.from(m[3], 'base64'));
  if (bytes.length > MAX_IMAGE) bad(400, 'The logo is too big (2 MB at most).');
  const magic: Record<string, number[]> = { png: [0x89, 0x50, 0x4e, 0x47], jpeg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
  if (!magic[m[2]].every((b, i) => bytes[i] === b)) bad(400, 'The logo file is not a valid picture.');
  return { bytes, type: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] };
}

/* ─────────────── Supabase + Razorpay calls ─────────────── */

function clients(d: ShopDeps) {
  const { env } = d;
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  const rest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const r = await d.fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...admin, ...(init.headers || {}) } });
    const body = await r.json().catch(() => null);
    if (!r.ok) bad(502, `Database: ${(body as Row)?.message || r.status}`);
    return body as T;
  };
  const rpc = <T>(fn: string, args: Row) => rest<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  /** The signed-in user behind the browser's / app's access token. */
  const user = async (req: Request): Promise<{ id: string; phone: string; email: string }> => {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) bad(401, 'Please sign in first.');
    const r = await d.fetch(`${base}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
    if (!r.ok) bad(401, 'Your sign-in has expired. Please sign in again.');
    const u = (await r.json()) as Row;
    return { id: String(u.id), phone: String(u.phone || ''), email: String(u.email || '') };
  };
  /** buyer_link as the buyer (so their customer record exists and is theirs). */
  const linkBuyer = async (req: Request) => {
    const r = await d.fetch(`${base}/rest/v1/rpc/buyer_link`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: req.headers.get('authorization') || '', 'content-type': 'application/json' },
      body: JSON.stringify({ p_org: env.SHOP_ORG_ID }),
    });
    if (!r.ok) bad(502, 'Could not open your account.');
  };
  const razorpay = async <T>(path: string, body?: Row): Promise<T> => {
    const r = await d.fetch(`${RZP}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const out = (await r.json().catch(() => ({}))) as Row & { error?: { description?: string } };
    if (!r.ok) bad(502, `Payment service: ${out.error?.description || r.status}`);
    return out as T;
  };
  /** Put a file in the private storage bucket (service role). */
  const upload = async (path: string, bytes: Uint8Array, type: string) => {
    const r = await d.fetch(`${base}/storage/v1/object/private/${path}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': type, 'x-upsert': 'true' },
      body: bytes,
    });
    if (!r.ok) bad(502, 'Could not save your artwork. Please try again.');
  };
  return { rest, rpc, user, linkBuyer, razorpay, upload };
}

/** An order of this business with its lines, payments and amount due (from the rows, with box-core totals). */
async function loadOrder(c: ReturnType<typeof clients>, org: string, orderId: string) {
  const id = encodeURIComponent(orderId);
  const [orders, items, payments] = await Promise.all([
    c.rest<Row[]>(`orders?id=eq.${id}&org_id=eq.${org}&deleted_at=is.null&select=*`),
    c.rest<Row[]>(`order_items?order_id=eq.${id}&select=*`),
    c.rest<Row[]>(`payments?order_id=eq.${id}&select=*`),
  ]);
  const [order] = ordersFromRows(orders, items, payments);
  if (!order) bad(404, 'Order not found.');
  const [customer] = await c.rest<Row[]>(`customers?id=eq.${encodeURIComponent(order.customerId)}&select=id,name,phone,email,user_id`);
  return { order, view: orderView(order), customer: customer || {} };
}

const paise = (rupees: number) => Math.round(rupees * 100);

/** Spec as stored on a buyer-visible order line: no paper prices. */
const publicSpec = (s: BoxSpec): BoxSpec => ({ ...s, layers: s.layers.map((l) => ({ ...l, price: 0 })) });

/* ─────────────── handlers ─────────────── */

export function createShop(d: ShopDeps) {
  const c = clients(d);
  const org = d.env.SHOP_ORG_ID;
  const name = d.env.BUSINESS_NAME || 'Honey Packers';
  const wrap = (fn: (req: Request) => Promise<Response>, cors = false) => async (req: Request) => {
    if (cors && req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, cors);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message }, cors);
      d.log?.(`shop error: ${(e as Error)?.stack || e}`);
      return json(500, { error: 'Something went wrong. Please try again.' }, cors);
    }
  };
  const body = async (req: Request) => ((await req.json().catch(() => ({}))) || {}) as Row;

  const checkoutFor = async (orderId: string, number: string, amount: number, phone: string, email: string) => {
    if (amount <= 0) bad(400, 'Nothing to pay on this order.');
    const ro = await c.razorpay<{ id: string; amount: number; currency: string }>('orders', {
      amount: paise(amount),
      currency: 'INR',
      receipt: number.slice(0, 40),
      notes: { order_id: orderId, org_id: org, order_no: number },
    });
    return {
      keyId: d.env.RAZORPAY_KEY_ID,
      razorpayOrderId: ro.id,
      amount: ro.amount,
      currency: ro.currency,
      name,
      description: `Order ${number}`,
      orderId,
      orderNumber: number,
      prefill: { contact: phone ? `+${phone.replace(/^\+/, '')}` : '', email },
      notes: { order_id: orderId, org_id: org },
    };
  };

  return {
    /** Buyer pays the amount due on one of their own orders. Body: { orderId } */
    payOrder: wrap(async (req) => {
      const u = await c.user(req);
      const { orderId } = await body(req);
      const o = await loadOrder(c, org, String(orderId || ''));
      if (o.customer.user_id !== u.id) bad(404, 'Order not found.');
      if (o.order.status === 'cancelled') bad(400, 'This order is cancelled.');
      return json(200, await checkoutFor(o.order.id, o.order.number, o.view.due, u.phone, String(o.customer.email || '')));
    }),

    /** Buyer orders a custom box from the price page. Body: { length, width, height, gradeId, colours, qty, pincode } */
    checkoutCustom: wrap(async (req) => {
      const u = await c.user(req);
      const b = await body(req);
      const [rules] = await c.rest<PriceRulesRow[]>(`price_rules?org_id=eq.${org}&select=rules,advance_pct,min_order_value,show_prices`);
      if (!rules) bad(503, 'Online ordering is not open yet.');
      const zones = await c.rest<DeliveryZoneRow[]>(`delivery_zones?org_id=eq.${org}&active=eq.true&deleted_at=is.null&select=*`);
      const shop: WebShop = fromDb(rules, zones);
      if (!shop.showPrices) bad(400, 'Online prices are switched off. Please send an enquiry.');
      const kind: PrintKind = ['plain', 'one', 'multi'].includes(String(b.print)) ? (String(b.print) as PrintKind) : printKindOf(Number(b.colours || 0));
      const colours = printColours(kind, shop.rules.printing.maxColours);
      if (kind !== 'plain' && colours === 0) bad(400, 'This printing is not offered online. Please send an enquiry.');
      const input = { length: Number(b.length), width: Number(b.width), height: Number(b.height), gradeId: String(b.gradeId || ''), colours, qty: Number(b.qty) };
      const p = priceCustomBox(input, shop.rules);
      if (!p.ok) bad(400, p.message);
      const pin = String(b.pincode || '').replace(/\s/g, '');
      const zone = findZone(shop.zones, pin);
      if (!zone) bad(400, "We don't deliver to this pincode online yet. Please send an enquiry.");
      const delivery = deliveryCharge(zone, p.weightKg * p.qty, p.amount);
      if (delivery == null) bad(400, 'Courier delivery is priced by enquiry for now. Please send an enquiry.');
      if (shop.minOrderValue > 0 && p.amount < shop.minOrderValue) bad(400, `The minimum online order is ₹${shop.minOrderValue} before GST.`);

      // The print design: checked like everything else from the browser; files go to private/<org>/artwork/<id>/.
      const art = (b.artwork || {}) as Record<string, unknown>;
      const design = cleanArtwork(art.design, kind, colours, { length: input.length, width: input.width, height: input.height });
      const logo = design?.elements.some((e) => e.kind === 'logo') ? imageFromDataUrl(art.logo) : null;
      if (design?.elements.some((e) => e.kind === 'logo') && !logo) bad(400, 'Please add the logo picture again.');
      const preview = design ? imageFromDataUrl(art.preview) : null;

      await c.linkBuyer(req);
      let artwork: Row = {};
      if (design) {
        const dir = `${org}/artwork/${crypto.randomUUID()}`;
        if (logo) await c.upload(`${dir}/logo.${logo.ext}`, logo.bytes, logo.type);
        if (preview) await c.upload(`${dir}/preview.${preview.ext}`, preview.bytes, preview.type);
        artwork = { ...design, ...(logo ? { logo: `${dir}/logo.${logo.ext}` } : {}), ...(preview ? { preview: `${dir}/preview.${preview.ext}` } : {}) };
      }
      const printText = kind === 'plain' ? ', plain' : `, ${printLabel(kind, colours).toLowerCase()}${design ? ', artwork attached' : ''}`;
      const items = [
        { description: `${p.grade.label || gradeLabel(p.grade)} box ${input.length}×${input.width}×${input.height} mm${printText}`, qty: p.qty, rate: p.unitPrice, hsn: '48191010', unit: 'Nos.', spec: publicSpec(p.spec) },
        ...(delivery > 0 ? [{ description: `Delivery (${zone.name})`, qty: 1, rate: delivery }] : []),
      ];
      const made = await c.rpc<{ id: string; number: string }>('web_create_order', {
        p_org: org,
        p_user: u.id,
        p_items: items,
        p_delivery: { pincode: pin, zone: zone.name, mode: zone.mode, charge: delivery, days: zone.days },
        p_tax_pct: TAX_PCT,
        p_notes: kind !== 'plain' && !design ? 'Ordered on the website. Printed box: artwork to be sent by the buyer.' : 'Ordered on the website',
        p_artwork: artwork,
      });
      const total = checkoutTotals(p.amount, delivery, TAX_PCT).total;
      return json(200, await checkoutFor(made.id, made.number, advanceAmount(total, shop.advancePct), u.phone, u.email));
    }),

    /** Buyer checks out the cart of standard products. Body: { lines: [{ productId, packQty, count }], pincode } */
    checkoutCart: wrap(async (req) => {
      const u = await c.user(req);
      const b = await body(req);
      const cart = (Array.isArray(b.lines) ? b.lines : []).slice(0, 50) as CartLine[];
      if (!cart.length) bad(400, 'Your cart is empty.');
      const [rules] = await c.rest<PriceRulesRow[]>(`price_rules?org_id=eq.${org}&select=rules,advance_pct,min_order_value,show_prices`);
      if (!rules) bad(503, 'Online ordering is not open yet.');
      const zones = await c.rest<DeliveryZoneRow[]>(`delivery_zones?org_id=eq.${org}&active=eq.true&deleted_at=is.null&select=*`);
      const shop: WebShop = fromDb(rules, zones);
      if (!shop.showPrices) bad(400, 'Online prices are switched off. Please send an enquiry.');
      const products = (await c.rest<Row[]>(`products?org_id=eq.${org}&active=eq.true&deleted_at=is.null&select=*`)).map(productFromRow);
      const priced = priceCart(cart, products);
      if (priced.problems.length) bad(409, priced.problems[0].message);
      const pin = String(b.pincode || '').replace(/\s/g, '');
      const zone = findZone(shop.zones, pin);
      if (!zone) bad(400, "We don't deliver to this pincode online yet. Please send an enquiry.");
      const delivery = deliveryCharge(zone, priced.weightKg, priced.goods);
      if (delivery == null) bad(400, 'Courier delivery is priced by enquiry for now. Please send an enquiry.');
      if (shop.minOrderValue > 0 && priced.goods < shop.minOrderValue) bad(400, `The minimum online order is ₹${shop.minOrderValue} before GST.`);

      await c.linkBuyer(req);
      const items = [
        ...priced.lines.map((l) => ({ description: `${l.product.name} (pack of ${l.pack.qty})${l.madeToOrder > 0 && l.product.stockQty != null ? `, ${l.madeToOrder} made to order` : ''}`, qty: l.count, rate: l.pack.price, hsn: l.product.hsn || '48191010', unit: 'Pack', spec: publicSpec(l.product.spec), product_id: l.product.id, pack_qty: l.pack.qty })),
        ...(delivery > 0 ? [{ description: `Delivery (${zone.name})`, qty: 1, rate: delivery }] : []),
      ];
      const made = await c.rpc<{ id: string; number: string }>('web_create_order', {
        p_org: org,
        p_user: u.id,
        p_items: items,
        p_delivery: { pincode: pin, zone: zone.name, mode: zone.mode, charge: delivery, days: zone.days },
        p_tax_pct: TAX_PCT,
        p_notes: 'Ordered on the website (standard boxes)',
      });
      const total = checkoutTotals(priced.goods, delivery, TAX_PCT).total;
      return json(200, await checkoutFor(made.id, made.number, advanceAmount(total, shop.advancePct), u.phone, u.email));
    }),

    /** Browser reports a finished checkout. Records the payment if Razorpay says it is captured (the webhook does it otherwise). */
    verifyPayment: wrap(async (req) => {
      const u = await c.user(req);
      const b = await body(req);
      const rzpOrderId = String(b.razorpay_order_id || '');
      const paymentId = String(b.razorpay_payment_id || '');
      const ro = await c.razorpay<{ id: string; notes?: Row }>(`orders/${encodeURIComponent(rzpOrderId)}`);
      const orderId = String(ro.notes?.order_id || '');
      if (ro.notes?.org_id !== org || !orderId) bad(400, 'Unknown payment.');
      if (!checkoutSignatureOk(ro.id, paymentId, String(b.razorpay_signature || ''), d.env.RAZORPAY_KEY_SECRET)) bad(400, 'Payment could not be verified.');
      const o = await loadOrder(c, org, orderId);
      if (o.customer.user_id !== u.id) bad(404, 'Order not found.');
      const pay = await c.razorpay<{ id: string; status: string; amount: number; order_id: string }>(`payments/${encodeURIComponent(paymentId)}`);
      if (pay.order_id !== ro.id) bad(400, 'Payment does not belong to this order.');
      if (pay.status !== 'captured') return json(202, { status: 'pending', orderNumber: o.order.number });
      await c.rpc('record_razorpay_payment', { p_org: org, p_order: orderId, p_amount: pay.amount / 100, p_payment_id: pay.id, p_rzp_order: ro.id, p_note: 'Paid online' });
      return json(200, { status: 'paid', orderNumber: o.order.number });
    }),

    /** Razorpay webhook (order.paid, payment_link.paid, payment.captured). */
    webhook: async (req: Request) => {
      if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
      const raw = await req.text();
      if (!webhookSignatureOk(raw, req.headers.get('x-razorpay-signature') || '', d.env.RAZORPAY_WEBHOOK_SECRET)) return json(401, { error: 'Bad signature' });
      let event: Row;
      try {
        event = JSON.parse(raw);
      } catch {
        return json(400, { error: 'Bad JSON' });
      }
      const p = paymentFromEvent(event);
      if (!p || p.orgId !== org) return json(200, { ignored: true });
      try {
        const r = await c.rpc<{ recorded: boolean }>('record_razorpay_payment', { p_org: org, p_order: p.orderId, p_amount: p.amount, p_payment_id: p.paymentId, p_rzp_order: p.rzpOrderId, p_note: event.event === 'payment_link.paid' ? 'Paid by payment link' : 'Paid online' });
        return json(200, r);
      } catch (e) {
        d.log?.(`webhook: ${(e as Error).message}`);
        return json(500, { error: 'not recorded' }); // Razorpay retries
      }
    },

    /** Office staff (from the BoxBook app) create a payment link for the amount due on an order. Body: { orderId } */
    paymentLink: wrap(async (req) => {
      const u = await c.user(req);
      const [profile] = await c.rest<Row[]>(`user_profiles?id=eq.${u.id}&select=role,is_active,organization_id`);
      if (!profile || !profile.is_active || profile.organization_id !== org || !OFFICE.includes(String(profile.role))) bad(403, 'Only the office can send payment links.');
      const { orderId } = await body(req);
      const o = await loadOrder(c, org, String(orderId || ''));
      if (o.view.due <= 0) bad(400, 'Nothing to pay on this order.');
      const phone = String(o.customer.phone || '').replace(/\D/g, '').slice(-10);
      const link = await c.razorpay<{ id: string; short_url: string }>('payment_links', {
        amount: paise(o.view.due),
        currency: 'INR',
        description: `${name} order ${o.order.number}`,
        reference_id: `${o.order.number}-${Date.now().toString(36)}`.slice(0, 40),
        customer: { name: String(o.customer.name || ''), ...(phone.length === 10 ? { contact: `+91${phone}` } : {}), ...(o.customer.email ? { email: String(o.customer.email) } : {}) },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order_id: o.order.id, org_id: org, order_no: o.order.number },
      });
      return json(200, { url: link.short_url, amount: o.view.due, orderNumber: o.order.number }, true);
    }, true),
  };
}

/** Environment for the Netlify functions. */
export const shopEnv = (get: (k: string) => string | undefined): ShopEnv => ({
  SUPABASE_URL: get('SUPABASE_URL') || get('PUBLIC_SUPABASE_URL') || '',
  SUPABASE_ANON_KEY: get('SUPABASE_ANON_KEY') || get('PUBLIC_SUPABASE_ANON_KEY') || '',
  SUPABASE_SERVICE_ROLE_KEY: get('SUPABASE_SERVICE_ROLE_KEY') || '',
  SHOP_ORG_ID: get('SHOP_ORG_ID') || get('PUBLIC_SHOP_ORG_ID') || '',
  RAZORPAY_KEY_ID: get('RAZORPAY_KEY_ID') || get('PUBLIC_RAZORPAY_KEY_ID') || '',
  RAZORPAY_KEY_SECRET: get('RAZORPAY_KEY_SECRET') || '',
  RAZORPAY_WEBHOOK_SECRET: get('RAZORPAY_WEBHOOK_SECRET') || '',
  BUSINESS_NAME: get('PUBLIC_BUSINESS_NAME') || undefined,
});
