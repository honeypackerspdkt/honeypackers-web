import { checkoutTotals, deliveryCharge, findZone, priceCart, type WebShop } from '@honeypackers/box-core/pricing';
import type { Product } from '@honeypackers/box-core/types';
import { catalog, priceList } from '../lib/catalog';
import { readCart, writeCart } from '../lib/products';
import { mobile10 } from '../lib/account';
import { addressProblem, composeAddress, fillAddressFields, parseAddress, readAddressFields } from '../lib/address';
import { bindSignInForm, codeHint, targetLabel } from '../lib/signin-form';
import type { SignInTarget } from '../lib/account-api';
import { icon } from '../lib/icons';
import { esc, rs } from '../lib/product-card';
import { rememberMe, signOutEverywhere } from '../lib/me';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const message = (e: unknown) => {
  const m = String((e as Error)?.message || e);
  if (/fetch|network/i.test(m)) return 'No internet connection. Please try again.';
  if (/expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return 'That code is wrong or has expired. Check it or send a new one.';
  return m;
};

/**
 * Checkout in order: 1 sign in (or create an account: same WhatsApp / e-mail code) → 2 delivery address (filled from the
 * profile, saved back to it: the order is delivered to the customer record's address) → 3 review → pay (server prices it again).
 */
export async function initCheckout(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const live = Boolean(root.dataset.live);
  const pin = $<HTMLInputElement>('[name=pincode]');
  const address = () => readAddressFields(root);
  const err = (t: string) => {
    $('[data-err]').textContent = t;
    $('[data-err]').hidden = !t;
  };
  let products: Product[] = [];
  let shop: WebShop | null = null;
  let shopLive = false;
  let signedIn = false;
  let target: SignInTarget | null = null;
  /** Signed in by e-mail: a mobile number for delivery is needed too. */
  let byEmail = false;
  /** Delivery address step: locked until signed in, then the saved address (card) or the form. */
  let addrMode: 'locked' | 'card' | 'form' = 'locked';
  let signedPhone = '';
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
      ? 'Online payment opens soon: send the order instead (step 1).'
      : !signedIn
        ? 'Sign in or create an account first (step 1).'
        : addrMode !== 'card'
          ? 'Confirm your delivery address (step 2).'
          : priced.problems.length || !priced.lines.length
            ? 'Fix the items in your order first (step 3).'
            : delivery == null
              ? 'We need a pincode we deliver to (step 2).'
              : min > 0 && priced.goods < min
                ? `Minimum online order is ₹${min} before GST.`
                : addrIssue();
    $<HTMLButtonElement>('[data-pay]').disabled = !!why;
    $('[data-pay-why]').textContent = why;
  }

  const field = (n: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${n}]`)!;

  /** What is wrong with the name / contact / address, or ''. */
  const addrIssue = () => {
    if (!field('name').value.trim()) return 'Add your name.';
    if (byEmail && !mobile10(field('phone').value)) return 'Add a 10-digit mobile number for delivery.';
    const g = field('gstin').value.trim().toUpperCase();
    if (g && !GSTIN.test(g)) return 'That GSTIN does not look right (15 characters, e.g. 33ABCDE1234F1Z5).';
    return addressProblem(address());
  };

  function showStep(which: 'off' | 'phone' | 'code' | 'signed') {
    for (const k of ['off', 'phone', 'code', 'signed']) $(`[data-${k}]`).hidden = k !== which;
    $('[data-step-signin]').classList.toggle('step--done', which === 'signed');
    $('[data-step-address]').hidden = which === 'off';
  }

  function setAddr(mode: typeof addrMode) {
    addrMode = mode;
    $('[data-addr-locked]').hidden = mode !== 'locked';
    $('[data-addr-card]').hidden = mode !== 'card';
    $('[data-addr-form]').hidden = mode !== 'form';
    $('[data-deliv]').hidden = mode === 'locked';
    $('[data-step-address]').classList.toggle('step--done', mode === 'card');
    if (mode === 'card') {
      const g = field('gstin').value.trim().toUpperCase();
      const company = field('company').value.trim();
      const m = mobile10(field('phone').value);
      const contact = byEmail ? (m ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : '') : signedPhone;
      $('[data-addr-text]').innerHTML =
        `<strong>${esc(field('name').value.trim())}</strong>${company ? ` · ${esc(company)}` : ''}<br>` +
        esc(composeAddress(address())).replace(/\n/g, '<br>') +
        `<br><span class="muted small">${esc([contact, field('email').value.trim(), g ? `GSTIN ${g}` : ''].filter(Boolean).join(' · '))}</span>`;
    }
    render();
  }

  const profileFromForm = () => {
    const gstin = field('gstin').value.trim().toUpperCase();
    return { name: field('name').value.trim(), company: field('company').value.trim(), gstin, stateCode: field('stateCode').value || (gstin ? gstin.slice(0, 2) : ''), address: composeAddress(address()), email: field('email').value.trim(), ...(byEmail ? { phone: mobile10(field('phone').value) } : {}) };
  };

  async function signedInView() {
    const a = await getApi();
    const me = await a.link();
    signedIn = true;
    const who = await a.signedIn();
    byEmail = Boolean(who && !who.phone);
    const digits = who?.phone ? who.phone.replace(/\D/g, '').slice(-10) : '';
    signedPhone = digits ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : '';
    $('[data-who]').innerHTML = `Signed in as <strong>${esc(me.name || signedPhone || who?.email || me.email)}</strong>${me.name ? ` <span class="muted">· ${esc(signedPhone || who?.email || me.email)}</span>` : ''}`;
    rememberMe(me);
    ($('[data-need-phone]') as HTMLElement).hidden = !byEmail;
    if (byEmail && !field('phone').value) field('phone').value = me.phone.replace(/\D/g, '').slice(-10);
    if (!field('name').value) field('name').value = me.name;
    if (!field('company').value) field('company').value = me.company;
    if (!field('gstin').value) field('gstin').value = me.gstin;
    if (!field('email').value) field('email').value = me.email;
    if (!field('stateCode').value && me.stateCode) field('stateCode').value = me.stateCode;
    fillAddressFields(root, parseAddress(me.address, me.stateCode));
    showStep('signed');
    setAddr(addrIssue() ? 'form' : 'card');
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
  root.addEventListener('input', (e) => (e.target as HTMLElement).closest('[data-addr-form]') && render());

  // delivery address: confirm (saved to the profile) / change
  $('[data-addr-done]').addEventListener('click', async () => {
    const issue = addrIssue();
    if (issue) return err(issue);
    err('');
    const btn = $<HTMLButtonElement>('[data-addr-done]');
    btn.disabled = true;
    try {
      const me = await (await getApi()).link(profileFromForm());
      rememberMe(me);
      setAddr('card');
    } catch (x) {
      err(message(x));
    } finally {
      btn.disabled = false;
    }
  });
  $('[data-addr-edit]').addEventListener('click', () => {
    setAddr('form');
    field('name').focus();
  });
  $('[data-signout]').addEventListener('click', async () => {
    await signOutEverywhere();
    signedIn = false;
    byEmail = false;
    for (const n of ['name', 'company', 'gstin', 'email', 'phone']) field(n).value = '';
    fillAddressFields(root, parseAddress('', ''), true);
    showStep('phone');
    setAddr('locked');
  });
  $('[data-address]').addEventListener('input', render);
  $('[data-address]').addEventListener('change', render);

  const phoneForm = $<HTMLFormElement>('[data-phone]');
  const codeForm = $<HTMLFormElement>('[data-code]');
  const signIn = bindSignInForm(phoneForm);
  const send = async () => {
    await (await getApi()).sendCode(target!);
    $('[data-mobile]').textContent = targetLabel(target!);
    $('[data-code-hint]').textContent = codeHint(target!);
    showStep('code');
    codeForm.querySelector<HTMLInputElement>('[name=code]')!.focus();
  };
  phoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = signIn.read();
    if (typeof t === 'string') return err(t);
    target = t;
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
    if (code.length !== 6) return err(codeHint(target!));
    err('');
    try {
      await (await getApi()).verifyCode(target!, code);
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
      await a.link(profileFromForm());
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
  setAddr('locked');
  if (!shopLive) showStep('off');
  else {
    try {
      if (await (await getApi()).signedIn()) await signedInView();
      else showStep('phone');
    } catch {
      showStep('phone');
    }
  }
  render();
}
