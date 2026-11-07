import { checkoutTotals, deliveryCharge, findZone, priceCart, type WebShop } from '@honeypackers/box-core/pricing';
import type { Product } from '@honeypackers/box-core/types';
import { catalog, priceList } from '../lib/catalog';
import { readCart, writeCart } from '../lib/products';
import { mobile10 } from '../lib/account';
import { icon } from '../lib/icons';
import { esc, rs } from '../lib/product-card';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const message = (e: unknown) => {
  const m = String((e as Error)?.message || e);
  if (/fetch|network/i.test(m)) return 'No internet connection. Please try again.';
  if (/expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return 'That code is wrong or has expired. Check it or send a new one.';
  return m;
};

/** One-page checkout: boxes → delivery → sign in by SMS + details → pay (server prices it again). */
export async function initCheckout(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const live = Boolean(root.dataset.live);
  const pin = $<HTMLInputElement>('[name=pincode]');
  const addr = $<HTMLTextAreaElement>('[name=address]');
  const err = (t: string) => {
    $('[data-err]').textContent = t;
    $('[data-err]').hidden = !t;
  };
  let products: Product[] = [];
  let shop: WebShop | null = null;
  let shopLive = false;
  let signedIn = false;
  let mobile = '';
  let api: typeof import('../lib/account-api') | null = null;
  const getApi = async () => (api ??= await import('../lib/account-api'));
  try {
    pin.value = localStorage.getItem('hp-pincode') || '';
  } catch {
    /* ignore */
  }

  function totals() {
    const priced = priceCart(readCart(), products);
    const code = pin.value.replace(/\D/g, '');
    let delivery: number | null = null;
    let deliv = '';
    if (code.length === 6 && shop) {
      const z = findZone(shop.zones, code);
      if (!z) deliv = 'We don’t deliver to this pincode online yet. Send the order as an enquiry and we’ll arrange transport.';
      else {
        delivery = deliveryCharge(z, priced.weightKg, priced.goods);
        deliv = delivery == null ? `Courier to ${esc(z.name)} is priced by enquiry for now.` : `<span class="stock-ok">Delivers to ${esc(z.name)}</span> in about ${z.days} day${z.days === 1 ? '' : 's'}${z.mode === 'pickup' ? ' (collect from our factory)' : ''} · ${Math.round(priced.weightKg)} kg`;
      }
    }
    return { priced, delivery, deliv, t: checkoutTotals(priced.goods, delivery ?? 0, 5) };
  }

  function render() {
    const cart = readCart();
    $('[data-empty]').hidden = cart.length > 0;
    $('[data-full]').hidden = cart.length === 0;
    if (!cart.length) return;
    const { priced, delivery, deliv, t } = totals();
    $('[data-lines]').innerHTML = priced.lines
      .map(
        (l) => `<div class="mini-line">
          <div><strong>${esc(l.product.name)}</strong><span class="small muted">Pack of ${l.pack.qty} · ${rs(l.pack.price)} a pack · ${l.boxes.toLocaleString('en-IN')} boxes</span></div>
          <strong class="mini-line__amt">${rs(l.amount)}</strong>
          <div class="qty"><button type="button" data-step="-1" data-id="${esc(l.product.id)}" data-pack="${l.pack.qty}" aria-label="One pack less">${icon.minus(16)}</button><span>${l.count}</span><button type="button" data-step="1" data-id="${esc(l.product.id)}" data-pack="${l.pack.qty}" aria-label="One pack more">${icon.plus(16)}</button></div>
          <div style="text-align:right"><button class="linkish small" type="button" data-remove data-id="${esc(l.product.id)}" data-pack="${l.pack.qty}">Remove</button></div>
        </div>`,
      )
      .join('');
    $('[data-problems]').hidden = !priced.problems.length;
    $('[data-problems]').innerHTML = priced.problems.map((p) => esc(p.message)).join('<br>');
    $('[data-deliv]').innerHTML = deliv;
    $('[data-goods]').textContent = rs(priced.goods);
    $('[data-delivery]').textContent = delivery == null ? (pin.value.replace(/\D/g, '').length === 6 ? 'Ask us' : 'Enter pincode') : delivery === 0 ? 'Free' : rs(delivery);
    $('[data-gst]').textContent = rs(t.tax);
    $('[data-total]').textContent = rs(t.total);

    // Without online payment: send the order on WhatsApp / as an enquiry.
    const text = [`Hi ${root.dataset.name || ''}, I'd like to order:`, ...priced.lines.map((l) => `• ${l.product.name}: ${l.count} pack(s) of ${l.pack.qty}`), pin.value ? `Delivery pincode: ${pin.value}` : ''].filter(Boolean).join('\n');
    const wa = root.querySelector<HTMLAnchorElement>('[data-wa-order]');
    if (wa && root.dataset.wa) wa.href = `https://wa.me/${root.dataset.wa}?text=${encodeURIComponent(text)}`;
    $<HTMLAnchorElement>('[data-enquiry-link]').href = `/contact/?details=${encodeURIComponent(text)}`;

    const min = shop?.minOrderValue || 0;
    const why = !shopLive
      ? 'Online payment opens soon: send the order instead (step 3).'
      : priced.problems.length || !priced.lines.length
        ? 'Fix the items above first.'
        : delivery == null
          ? 'Enter a pincode we deliver to.'
          : min > 0 && priced.goods < min
            ? `Minimum online order is ₹${min} before GST.`
            : !signedIn
              ? 'Sign in with your mobile number (step 3).'
              : !detailsOk()
                ? 'Add your name and delivery address.'
                : '';
    $<HTMLButtonElement>('[data-pay]').disabled = !!why;
    $('[data-pay-why]').textContent = why;
  }

  const field = (n: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${n}]`)!;
  const detailsOk = () => field('name').value.trim() !== '' && addr.value.trim() !== '' && (!field('gstin').value.trim() || GSTIN.test(field('gstin').value.trim().toUpperCase()));

  function showStep(which: 'off' | 'phone' | 'code' | 'details') {
    for (const k of ['off', 'phone', 'code', 'details']) $(`[data-${k}]`).hidden = k !== which;
    $('[data-step-details]').classList.toggle('step--done', which === 'details');
  }

  async function signedInView() {
    const a = await getApi();
    const me = await a.link();
    signedIn = true;
    $('[data-who]').textContent = `Signed in as +91 ${me.phone.replace(/\D/g, '').slice(-10)}`;
    if (!field('name').value) field('name').value = me.name;
    if (!field('company').value) field('company').value = me.company;
    if (!field('gstin').value) field('gstin').value = me.gstin;
    if (!field('email').value) field('email').value = me.email;
    if (!field('stateCode').value && me.stateCode) field('stateCode').value = me.stateCode;
    if (!addr.value) addr.value = me.address;
    showStep('details');
    render();
  }

  // steps and edits
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-step],[data-remove]');
    if (!el) return;
    writeCart(
      readCart()
        .map((l) => (l.productId === el.dataset.id && l.packQty === Number(el.dataset.pack) ? { ...l, count: el.hasAttribute('data-remove') ? 0 : Math.min(1000, l.count + Number(el.dataset.step)) } : l))
        .filter((l) => l.count > 0),
    );
  });
  window.addEventListener('cart-change', render);
  pin.addEventListener('input', () => {
    try {
      localStorage.setItem('hp-pincode', pin.value);
    } catch {
      /* ignore */
    }
    render();
  });
  root.addEventListener('input', (e) => (e.target as HTMLElement).closest('[data-details]') && render());
  addr.addEventListener('input', render);

  const phoneForm = $<HTMLFormElement>('[data-phone]');
  const codeForm = $<HTMLFormElement>('[data-code]');
  const send = async () => {
    await (await getApi()).sendCode(mobile);
    $('[data-mobile]').textContent = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    showStep('code');
    codeForm.querySelector<HTMLInputElement>('[name=code]')!.focus();
  };
  phoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mobile = mobile10(phoneForm.querySelector<HTMLInputElement>('[name=mobile]')!.value);
    if (!mobile) return err('Enter a 10-digit Indian mobile number.');
    err('');
    try {
      await send();
    } catch (x) {
      err(message(x));
    }
  });
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeForm.querySelector<HTMLInputElement>('[name=code]')!.value.replace(/\D/g, '');
    if (code.length !== 6) return err('Enter the 6-digit code from the SMS.');
    err('');
    try {
      await (await getApi()).verifyCode(mobile, code);
      await signedInView();
    } catch (x) {
      err(message(x));
    }
  });
  $('[data-change]').addEventListener('click', () => showStep('phone'));
  $('[data-resend]').addEventListener('click', () => send().catch((x) => err(message(x))));

  // pay
  $('[data-pay]').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('[data-pay]');
    btn.disabled = true;
    err('');
    try {
      const a = await getApi();
      const gstin = field('gstin').value.trim().toUpperCase();
      await a.link({ name: field('name').value.trim(), company: field('company').value.trim(), gstin, stateCode: field('stateCode').value || (gstin ? gstin.slice(0, 2) : ''), address: addr.value.trim(), email: field('email').value.trim() });
      const token = await a.accessToken();
      if (!token) throw new Error('Your sign-in has expired. Please sign in again.');
      const { callFn, pay } = await import('../lib/pay');
      const start = await callFn<import('../lib/pay').CheckoutStart>('checkout-cart', token, { lines: readCart(), pincode: pin.value.replace(/\D/g, '') });
      const r = await pay(start, token);
      if (r.status === 'closed') err(`Order ${start.orderNumber} is saved in My orders. You can pay there when you are ready.`);
      else {
        writeCart([]);
        location.href = `/account/?paid=${encodeURIComponent(r.orderNumber)}`;
        return;
      }
    } catch (x) {
      err(message(x));
    }
    render();
  });

  // load
  const [c, l] = await Promise.all([catalog(), priceList()]);
  products = c.products;
  shop = l.shop;
  shopLive = live && c.source === 'live' && l.source === 'live';
  if (!shopLive) showStep('off');
  else {
    try {
      if (await (await getApi()).signedInPhone()) await signedInView();
      else showStep('phone');
    } catch {
      showStep('phone');
    }
  }
  render();
}
