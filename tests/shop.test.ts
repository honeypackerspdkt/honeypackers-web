import { describe, expect, it, beforeEach } from 'vitest';
import { createShop, hmacHex, paymentFromEvent } from '../netlify/lib/shop';
import sample from '../src/data/sample-price-list.json';

const ORG = 'org-1';
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SHOP_ORG_ID: ORG, RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'key_secret', RAZORPAY_WEBHOOK_SECRET: 'hook_secret', BUSINESS_NAME: 'Honey Packers' };

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let rzp: { orders: Row[]; payments: Row[]; links: Row[] };
let rpcCalls: { fn: string; args: Row; auth: string }[];
let files: Record<string, { type: string; size: number; auth: string }>;

function reset() {
  db = {
    customers: [
      { id: 'c-1', org_id: ORG, name: 'Kumar', phone: '9876543210', email: 'k@x.in', user_id: 'u-buyer' },
      { id: 'c-2', org_id: ORG, name: 'Other', phone: '9000000000', user_id: 'u-other' },
      { id: 'c-3', org_id: ORG, name: 'Mail buyer', phone: '9123456789', email: 'm@x.in', user_id: 'u-mail' },
    ],
    orders: [{ id: 'o-1', org_id: ORG, number: 'ORD-0007', customer_id: 'c-1', date: '2026-11-01', status: 'delivered', discount: 100, tax_pct: 5, deleted_at: null }],
    order_items: [
      { id: 'i-1', order_id: 'o-1', position: 0, description: '3 ply', qty: 500, rate: 12.8, deleted_at: null },
      { id: 'i-2', order_id: 'o-1', position: 1, description: 'Plate', qty: 1, rate: 1500, deleted_at: null },
    ],
    payments: [{ id: 'p-1', order_id: 'o-1', amount: 3000, deleted_at: null }],
    price_rules: [{ org_id: ORG, rules: sample.rules, advance_pct: '100.00', min_order_value: '0', show_prices: true }],
    delivery_zones: [
      { id: 'z-own', org_id: ORG, name: 'Pudukkottai', pincode_from: 622001, pincode_to: 622999, mode: 'own', rate_per_kg: '4', min_charge: '300', free_above: null, days: 1, active: true, sort: 0, deleted_at: null },
      { id: 'z-tn', org_id: ORG, name: 'Tamil Nadu', pincode_from: 600000, pincode_to: 643999, mode: 'courier', rate_per_kg: '0', min_charge: '0', free_above: null, days: 4, active: true, sort: 1, deleted_at: null },
    ],
    products: [
      { id: 'prod-1', org_id: ORG, name: '3 ply box 300×200×150 mm', ply: 3, spec: { length: 300, width: 200, height: 150, ply: 3, perLayer: false, layers: [{ gsm: 120, bf: 18, price: 0 }] }, packs: [{ qty: 25, price: 450 }, { qty: 100, price: 1600 }], hsn: '48191010', tax_pct: 5, stock_qty: null, active: true, deleted_at: null },
      { id: 'prod-2', org_id: ORG, name: 'Few left', ply: 3, spec: { length: 200, width: 150, height: 100, ply: 3, perLayer: false, layers: [{ gsm: 120, bf: 18, price: 0 }] }, packs: [{ qty: 50, price: 600 }], hsn: '48191010', tax_pct: 5, stock_qty: 60, active: true, deleted_at: null },
      { id: 'prod-off', org_id: ORG, name: 'Hidden', ply: 3, spec: { length: 1, width: 1, height: 1, ply: 3, perLayer: false, layers: [] }, packs: [{ qty: 1, price: 1 }], active: false, deleted_at: null },
    ],
    user_profiles: [
      { id: 'u-staff', role: 'Sales', is_active: true, organization_id: ORG },
      { id: 'u-prod', role: 'Production', is_active: true, organization_id: ORG },
    ],
  };
  rzp = { orders: [], payments: [], links: [] };
  rpcCalls = [];
  files = {};
}

const USERS: Record<string, Row> = { buyer: { id: 'u-buyer', phone: '919876543210' }, other: { id: 'u-other', phone: '919000000000' }, staff: { id: 'u-staff' }, prod: { id: 'u-prod' }, mail: { id: 'u-mail', email: 'm@x.in' } };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const headers = (init.headers || {}) as Record<string, string>;
  const method = init.method || 'GET';
  if (url.host === 'db.test' && url.pathname.startsWith('/storage/v1/object/private/')) {
    const bytes = init.body as Uint8Array;
    files[url.pathname.slice('/storage/v1/object/private/'.length)] = { type: headers['content-type'], size: bytes.length, auth: headers.authorization };
    return ok({ Key: url.pathname });
  }
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  if (url.host === 'db.test') {
    if (url.pathname === '/auth/v1/user') {
      const u = USERS[(headers.authorization || '').replace('Bearer ', '')];
      return u ? ok(u) : ok({ msg: 'invalid JWT' }, 401);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.slice('/rest/v1/rpc/'.length);
      rpcCalls.push({ fn, args: body, auth: headers.authorization });
      if (fn === 'buyer_link') return ok('c-1');
      if (fn === 'web_create_order') {
        const id = `o-${db.orders.length + 1}`;
        const number = `ORD-${String(db.orders.length + 8).padStart(4, '0')}`;
        const cust = db.customers.find((c) => c.user_id === body.p_user)!;
        db.orders.push({ id, org_id: body.p_org, number, customer_id: cust.id, date: '2026-11-08', status: 'quote', discount: 0, tax_pct: body.p_tax_pct, deleted_at: null, source: 'web', artwork: body.p_artwork ?? {}, notes: body.p_notes });
        (body.p_items as Row[]).forEach((it, i) => db.order_items.push({ id: `${id}-i${i}`, order_id: id, position: i, ...it, deleted_at: null }));
        return ok({ id, number });
      }
      if (fn === 'record_razorpay_payment') {
        if (db.payments.some((p) => p.razorpay_payment_id === body.p_payment_id)) return ok({ recorded: false });
        db.payments.push({ id: `p-${db.payments.length + 1}`, order_id: body.p_order, amount: body.p_amount, razorpay_payment_id: body.p_payment_id, deleted_at: null });
        return ok({ recorded: true });
      }
    }
    const table = url.pathname.replace('/rest/v1/', '');
    let rows = db[table] || [];
    for (const [k, v] of url.searchParams) {
      if (k === 'select' || k === 'order') continue;
      if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === decodeURIComponent(v.slice(3)));
      if (v === 'is.null') rows = rows.filter((r) => r[k] == null);
    }
    expect(headers.apikey).toBe('service'); // table reads only with the service key
    return ok(rows);
  }
  if (url.host === 'api.razorpay.com') {
    expect(headers.authorization).toBe(`Basic ${Buffer.from('rzp_test_key:key_secret').toString('base64')}`);
    const [, , kind, id] = url.pathname.split('/');
    if (kind === 'orders' && method === 'POST') {
      const o = { id: `order_${rzp.orders.length + 1}`, amount: body.amount, currency: body.currency, notes: body.notes, receipt: body.receipt };
      rzp.orders.push(o);
      return ok(o);
    }
    if (kind === 'orders') return ok(rzp.orders.find((o) => o.id === id) || {}, rzp.orders.some((o) => o.id === id) ? 200 : 404);
    if (kind === 'payments') return ok(rzp.payments.find((p) => p.id === id) || {});
    if (kind === 'payment_links') {
      const l = { id: `plink_${rzp.links.length + 1}`, short_url: `https://rzp.io/i/${rzp.links.length + 1}`, ...body };
      rzp.links.push(l);
      return ok(l);
    }
  }
  throw new Error(`unexpected request ${method} ${url}`);
}) as typeof fetch;

const shop = () => createShop({ env, fetch: fakeFetch });
const post = (token: string | null, body: unknown, extra: Record<string, string> = {}) =>
  new Request('https://site/x', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: JSON.stringify(body) });

beforeEach(reset);

describe('pay the amount due', () => {
  it('makes a Razorpay order for exactly what is due on the buyer’s own order', async () => {
    const r = await shop().payOrder(post('buyer', { orderId: 'o-1' }));
    const out = await r.json();
    expect(r.status).toBe(200);
    // (500 × 12.8 + 1500 − 100) × 1.05 = 8,190 − 3,000 paid = 5,190
    expect(out).toMatchObject({ keyId: 'rzp_test_key', amount: 519000, currency: 'INR', orderNumber: 'ORD-0007', prefill: { contact: '+919876543210' } });
    expect(rzp.orders[0].notes).toEqual({ order_id: 'o-1', org_id: ORG, order_no: 'ORD-0007' });
  });
  it('refuses other people’s orders and missing sign-in', async () => {
    expect((await shop().payOrder(post('other', { orderId: 'o-1' }))).status).toBe(404);
    expect((await shop().payOrder(post(null, { orderId: 'o-1' }))).status).toBe(401);
    expect((await shop().payOrder(post('expired', { orderId: 'o-1' }))).status).toBe(401);
    expect(rzp.orders).toHaveLength(0);
  });
});

describe('buy a custom box', () => {
  const box = { length: 300, width: 200, height: 150, gradeId: '3-120-18', colours: 1, qty: 500, pincode: '622001' };

  it('prices on the server, creates the order and asks for the full amount (100% upfront)', async () => {
    const r = await shop().checkoutCustom(post('buyer', { ...box, unitPrice: 0.01 })); // a price sent by the browser is ignored
    const out = await r.json();
    expect(r.status, JSON.stringify(out)).toBe(200);
    const made = db.orders.at(-1)!;
    const lines = db.order_items.filter((i) => i.order_id === made.id);
    expect(lines.map((l) => [l.qty, l.rate])).toEqual([[500, 14.84], [1, 317.02]]); // ₹14.84/box (hand-worked); delivery 79.255 kg × ₹4
    expect((lines[0].spec as { layers: { price: number }[] }).layers.every((l) => l.price === 0)).toBe(true); // paper prices not stored on the buyer's order
    // (7,420 + 317.02) × 1.05 = 8,123.87
    expect(out.amount).toBe(812387);
    expect(rpcCalls.find((c) => c.fn === 'buyer_link')!.auth).toBe('Bearer buyer'); // linked as the buyer, not with the service key
    expect(rpcCalls.find((c) => c.fn === 'web_create_order')!.args).toMatchObject({ p_org: ORG, p_user: 'u-buyer', p_tax_pct: 5 });
  });

  // A 1×1 PNG, as the browser would send it.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const design = { ink: '#c62828', elements: [{ id: 'l', kind: 'logo', x: 0.3, y: 0.5, w: 0.4, ratio: 1 }, { id: 't', kind: 'text', text: 'Honey Packers', x: 0.7, y: 0.5, size: 0.12 }] };

  it('stores the print design with the order and the logo + preview in the private bucket', async () => {
    const r = await shop().checkoutCustom(post('buyer', { ...box, colours: undefined, print: 'one', artwork: { design, logo: PNG, preview: PNG } }));
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const made = db.orders.at(-1)!;
    const art = made.artwork as Row & { elements: Row[] };
    expect(art).toMatchObject({ print: 'one', colours: 1, ink: '#c62828', box: { length: 300, width: 200, height: 150 } });
    expect(art.elements[1]).toMatchObject({ text: 'Honey Packers', color: '#c62828' });
    expect(String(art.logo)).toMatch(/^org-1\/artwork\/[0-9a-f-]{36}\/logo\.png$/);
    expect(Object.keys(files).sort()).toEqual([art.logo, art.preview].sort());
    expect(Object.values(files).every((f) => f.auth === 'Bearer service' && f.type === 'image/png')).toBe(true);
    expect(db.order_items.find((i) => i.order_id === made.id)!.description).toMatch(/1 colour print, artwork attached/);
  });

  it('prices multicolour at the most colours the price list allows', async () => {
    await shop().checkoutCustom(post('buyer', { ...box, colours: undefined, print: 'multi' }));
    const made = db.orders.at(-1)!;
    expect(db.order_items.find((i) => i.order_id === made.id)!.description).toMatch(/multicolour print \(up to 4 colours\)/);
    expect(made.notes).toMatch(/artwork to be sent/);
    expect(made.artwork).toEqual({});
  });

  it('refuses files that are not pictures, and a logo without its file', async () => {
    const msg = async (artwork: object) => (await (await shop().checkoutCustom(post('buyer', { ...box, print: 'one', artwork }))).json()).error;
    expect(await msg({ design, logo: 'data:image/svg+xml;base64,PHN2Zz4=' })).toMatch(/PNG, JPG or WebP/);
    expect(await msg({ design, logo: 'data:image/png;base64,AAAA' })).toMatch(/not a valid picture/);
    expect(await msg({ design })).toMatch(/logo picture again/);
    expect(Object.keys(files)).toHaveLength(0);
  });

  it('turns away what cannot be sold online', async () => {
    const msg = async (b: object) => (await (await shop().checkoutCustom(post('buyer', { ...box, ...b }))).json()).error;
    expect(await msg({ pincode: '600001' })).toMatch(/Courier/);
    expect(await msg({ pincode: '110001' })).toMatch(/don't deliver/);
    expect(await msg({ height: 1700 })).toMatch(/larger than our machines/);
    expect(await msg({ qty: 10 })).toMatch(/Minimum order/);
    db.price_rules[0].show_prices = false;
    expect(await msg({})).toMatch(/switched off/);
    expect(db.orders).toHaveLength(1);
  });
});

describe('confirming a payment', () => {
  async function paid(status: string) {
    const out = await (await shop().payOrder(post('buyer', { orderId: 'o-1' }))).json();
    rzp.payments.push({ id: 'pay_1', order_id: out.razorpayOrderId, status, amount: out.amount });
    return { razorpay_order_id: out.razorpayOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: hmacHex('key_secret', `${out.razorpayOrderId}|pay_1`) };
  }
  it('records a captured payment once', async () => {
    const b = await paid('captured');
    const r1 = await shop().verifyPayment(post('buyer', b));
    expect(await r1.json()).toEqual({ status: 'paid', orderNumber: 'ORD-0007' });
    await shop().verifyPayment(post('buyer', b));
    expect(db.payments.filter((p) => p.razorpay_payment_id === 'pay_1')).toHaveLength(1);
    expect(db.payments.at(-1)!.amount).toBe(5190);
  });
  it('rejects a forged signature, and leaves not-yet-captured payments to the webhook', async () => {
    const b = await paid('authorized');
    expect((await shop().verifyPayment(post('buyer', { ...b, razorpay_signature: 'forged' }))).status).toBe(400);
    const r = await shop().verifyPayment(post('buyer', b));
    expect(r.status).toBe(202);
    expect(db.payments).toHaveLength(1);
  });
});

describe('webhook', () => {
  const event = (name: string, extra: Row = {}) => ({
    event: name,
    payload: { payment: { entity: { id: 'pay_W', amount: 519000, status: 'captured', order_id: 'order_9', notes: {} } }, order: { entity: { id: 'order_9', notes: { order_id: 'o-1', org_id: ORG } } }, ...extra },
  });
  const send = (body: unknown, secret = 'hook_secret') => {
    const raw = JSON.stringify(body);
    return shop().webhook(new Request('https://site/hook', { method: 'POST', headers: { 'x-razorpay-signature': hmacHex(secret, raw) }, body: raw }));
  };

  it('records order.paid once, even when Razorpay sends it twice', async () => {
    expect(await (await send(event('order.paid'))).json()).toEqual({ recorded: true });
    expect(await (await send(event('order.paid'))).json()).toEqual({ recorded: false });
    expect(db.payments.filter((p) => p.razorpay_payment_id === 'pay_W')).toHaveLength(1);
  });
  it('payment links carry the order in the link notes', () => {
    const e = event('payment_link.paid', { order: undefined, payment_link: { entity: { id: 'plink_1', notes: { order_id: 'o-1', org_id: ORG } } } });
    expect(paymentFromEvent(e)).toMatchObject({ paymentId: 'pay_W', amount: 5190, orderId: 'o-1' });
  });
  it('ignores bad signatures, other events, other businesses and uncaptured payments', async () => {
    expect((await send(event('order.paid'), 'wrong')).status).toBe(401);
    expect(await (await send(event('refund.created'))).json()).toEqual({ ignored: true });
    expect(await (await send({ ...event('order.paid'), payload: { ...event('order.paid').payload, order: { entity: { notes: { order_id: 'o-1', org_id: 'someone-else' } } } } })).json()).toEqual({ ignored: true });
    expect(paymentFromEvent({ event: 'payment.captured', payload: { payment: { entity: { id: 'x', status: 'failed', notes: { order_id: 'o', org_id: ORG } } } } })).toBeNull();
    expect(db.payments).toHaveLength(1);
  });
});

describe('payment links from the app', () => {
  it('office staff get a link for the amount due, with the customer’s number', async () => {
    const r = await shop().paymentLink(post('staff', { orderId: 'o-1' }));
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.json()).toEqual({ url: 'https://rzp.io/i/1', amount: 5190, orderNumber: 'ORD-0007' });
    expect(rzp.links[0]).toMatchObject({ amount: 519000, currency: 'INR', customer: { name: 'Kumar', contact: '+919876543210', email: 'k@x.in' }, notes: { order_id: 'o-1', org_id: ORG } });
  });
  it('production staff and buyers cannot; the app’s preflight is answered', async () => {
    expect((await shop().paymentLink(post('prod', { orderId: 'o-1' }))).status).toBe(403);
    expect((await shop().paymentLink(post('buyer', { orderId: 'o-1' }))).status).toBe(403);
    const pre = await shop().paymentLink(new Request('https://site/x', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});

describe('cart of standard products', () => {
  it('prices the cart on the server and creates the order with pack lines', async () => {
    const r = await shop().checkoutCart(post('buyer', { lines: [{ productId: 'prod-1', packQty: 100, count: 2, price: 1 }], pincode: '622001' }));
    const out = await r.json();
    expect(r.status, JSON.stringify(out)).toBe(200);
    const made = db.orders.at(-1)!;
    expect(db.order_items.filter((i) => i.order_id === made.id).map((i) => [i.description, i.qty, i.rate, i.unit])).toEqual([
      ['3 ply box 300×200×150 mm (pack of 100)', 2, 1600, 'Pack'],
      ['Delivery (Pudukkottai)', 1, 300], // 31.702 kg × ₹4 = ₹126.81 → minimum ₹300
    ].map((x) => (x.length === 3 ? [...x, undefined] : x)));
    // (3,200 + 300) × 1.05 = 3,675
    expect(out.amount).toBe(367500);
  });

  it('takes short stock as made to order and tells the database which product and pack each line is', async () => {
    const r = await shop().checkoutCart(post('buyer', { lines: [{ productId: 'prod-2', packQty: 50, count: 2 }], pincode: '622001' }));
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const line = db.order_items.filter((i) => i.order_id === db.orders.at(-1)!.id)[0];
    expect(line).toMatchObject({ description: 'Few left (pack of 50), 40 made to order', qty: 2, product_id: 'prod-2', pack_qty: 50 });
  });

  it('gives Razorpay the delivery mobile of a buyer who signed in by e-mail', async () => {
    const out = await (await shop().checkoutCart(post('mail', { lines: [{ productId: 'prod-1', packQty: 25, count: 1 }], pincode: '622001' }))).json();
    expect(out.prefill).toEqual({ contact: '+919123456789', email: 'm@x.in' });
  });

  it('refuses switched-off products, missing packs and empty carts', async () => {
    const err = async (lines: unknown[], pincode = '622001') => (await (await shop().checkoutCart(post('buyer', { lines, pincode }))).json()).error;
    expect(await err([{ productId: 'prod-off', packQty: 1, count: 1 }])).toMatch(/no longer sold/);
    expect(await err([{ productId: 'prod-1', packQty: 30, count: 1 }])).toMatch(/pack size/);
    expect(await err([])).toMatch(/empty/);
    expect(await err([{ productId: 'prod-1', packQty: 25, count: 1 }], '600001')).toMatch(/Courier/);
    expect((await shop().checkoutCart(post(null, { lines: [{ productId: 'prod-1', packQty: 25, count: 1 }] }))).status).toBe(401);
    expect(db.orders).toHaveLength(1);
  });
});
