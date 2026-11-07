import type { Customer, Order } from '@honeypackers/box-core/types';
import { invoiceCompany, mobile10, orderView, reorderLink, reorderText } from '../lib/account';
import * as api from '../lib/account-api';
import { callFn, pay, type CheckoutStart } from '../lib/pay';

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `₹${inr.format(n)}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const message = (e: unknown) => {
  const m = String((e as Error)?.message || e);
  if (/fetch|network/i.test(m)) return 'No internet connection. Please try again.';
  if (/expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return 'That code is wrong or has expired. Check it or send a new one.';
  return m;
};

export async function initAccount(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const views = ['off', 'loading', 'phone', 'code', 'account'] as const;
  const show = (v: (typeof views)[number]) => views.forEach((x) => ($(`[data-view="${x}"]`).hidden = x !== v));
  const setError = (form: Element, msg: string) => {
    const p = form.querySelector<HTMLElement>('[data-error]')!;
    p.textContent = msg;
    p.hidden = !msg;
  };
  const busy = (form: HTMLFormElement, on: boolean) => form.querySelectorAll('button').forEach((b) => (b.disabled = on));

  if (!root.dataset.enabled) return show('off');

  let mobile = '';
  let me: Customer | null = null;
  let orders: Order[] = [];
  let business: Record<string, unknown> | null = null;

  const phoneForm = $<HTMLFormElement>('[data-view="phone"]');
  const codeForm = $<HTMLFormElement>('[data-view="code"]');
  const profileForm = $<HTMLFormElement>('[data-profile]');

  const sendCode = async () => {
    await api.sendCode(mobile);
    $('[data-mobile]').textContent = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
    show('code');
    codeForm.querySelector<HTMLInputElement>('[name=code]')!.focus();
  };

  phoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mobile = mobile10(phoneForm.querySelector<HTMLInputElement>('[name=mobile]')!.value);
    if (!mobile) return setError(phoneForm, 'Enter a 10-digit Indian mobile number.');
    setError(phoneForm, '');
    busy(phoneForm, true);
    try {
      await sendCode();
    } catch (err) {
      setError(phoneForm, message(err));
    } finally {
      busy(phoneForm, false);
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeForm.querySelector<HTMLInputElement>('[name=code]')!.value.replace(/\D/g, '');
    if (code.length !== 6) return setError(codeForm, 'Enter the 6-digit code from the SMS.');
    setError(codeForm, '');
    busy(codeForm, true);
    try {
      await api.verifyCode(mobile, code);
      await openAccount();
    } catch (err) {
      setError(codeForm, message(err));
    } finally {
      busy(codeForm, false);
    }
  });
  $('[data-change]').addEventListener('click', () => show('phone'));
  $('[data-resend]').addEventListener('click', async () => {
    try {
      await sendCode();
      setError(codeForm, '');
    } catch (err) {
      setError(codeForm, message(err));
    }
  });

  const fillProfile = (c: Customer) => {
    const set = (n: string, v: string) => ((profileForm.elements.namedItem(n) as HTMLInputElement).value = v);
    set('name', c.name);
    set('company', c.company);
    set('gstin', c.gstin);
    set('stateCode', c.stateCode || '');
    set('address', c.address);
    set('email', c.email);
  };
  const openProfile = (first: boolean) => {
    if (me) fillProfile(me);
    $('[data-profile-title]').textContent = first ? 'Welcome! Tell us who you are' : 'Your details';
    $('[data-profile-cancel]').hidden = first;
    profileForm.hidden = false;
    profileForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('[data-edit-profile]').addEventListener('click', () => openProfile(false));
  $('[data-profile-cancel]').addEventListener('click', () => (profileForm.hidden = true));
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(profileForm);
    const v = (k: string) => String(f.get(k) || '').trim();
    if (!v('name')) return setError(profileForm, 'Please enter your name.');
    const gstin = v('gstin').toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return setError(profileForm, 'That GSTIN does not look right (15 characters, e.g. 33ABCDE1234F1Z5).');
    setError(profileForm, '');
    busy(profileForm, true);
    try {
      me = await api.link({ name: v('name'), company: v('company'), gstin, stateCode: v('stateCode') || (gstin ? gstin.slice(0, 2) : ''), address: v('address'), email: v('email') });
      profileForm.hidden = true;
      renderWho();
      const back = new URLSearchParams(location.search).get('return');
      if (back && back.startsWith('/') && !back.startsWith('//')) location.href = back;
    } catch (err) {
      setError(profileForm, message(err));
    } finally {
      busy(profileForm, false);
    }
  });

  $('[data-signout]').addEventListener('click', async () => {
    await api.signOut();
    me = null;
    orders = [];
    show('phone');
  });

  const renderWho = () => {
    $('[data-who]').textContent = me ? `Signed in as ${me.name || 'you'} · ${me.phone ? `+91 ${me.phone.slice(-10, -5)} ${me.phone.slice(-5)}` : ''}${me.company ? ` · ${me.company}` : ''}` : '';
  };

  const renderOrders = () => {
    const box = $('[data-orders]');
    if (!orders.length) {
      box.innerHTML = `<div class="card"><p style="margin:0">No orders yet. <a href="/custom-box/">Price your first box</a> or <a href="/contact/">send an enquiry</a>.</p></div>`;
      return;
    }
    const wa = root.dataset.wa;
    box.innerHTML = orders
      .map((o, idx) => {
        const v = orderView(o);
        const lines = o.items
          .map((i) => {
            const link = reorderLink(i);
            return `<li>${esc(i.description)} <span class="muted">× ${i.qty.toLocaleString('en-IN')}</span>${link ? ` · <a href="${link}">price again</a>` : ''}</li>`;
          })
          .join('');
        const waText = encodeURIComponent(reorderText(o, root.dataset.name || '', me?.name || ''));
        return `<article class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
            <h2 style="font-size:1.15rem;margin:0">${esc(o.number)}</h2>
            <span class="tag">${esc(v.status)}</span>
          </div>
          <p class="muted small" style="margin:4px 0 10px">${date(o.date)}${o.dueDate && o.status !== 'delivered' ? ` · delivery by ${date(o.dueDate)}` : ''}${o.invoiceNo ? ` · invoice ${esc(o.invoiceNo)}` : ''}</p>
          <ul style="margin:0 0 12px;padding-left:1.1em">${lines}</ul>
          <dl class="kv"><dt>Total (incl. GST)</dt><dd>${rs(v.total)}</dd>${v.paid ? `<dt>Paid</dt><dd>${rs(v.paid)}</dd>` : ''}${o.status !== 'quote' && o.status !== 'cancelled' && v.due > 0.5 ? `<dt>Amount due</dt><dd>${rs(v.due)}</dd>` : ''}</dl>
          <div class="btn-row" style="margin-top:14px">
            ${v.due > 0.5 && o.status !== 'cancelled' ? `<button class="btn btn--primary" type="button" data-pay="${idx}">Pay ${rs(v.due)} now</button>` : ''}
            ${v.canInvoice ? `<button class="btn btn--ghost" type="button" data-invoice="${idx}">Download invoice (PDF)</button>` : ''}
            ${wa ? `<a class="btn btn--whatsapp" href="https://wa.me/${wa}?text=${waText}" data-wa="reorder" rel="noopener">Order again</a>` : ''}
          </div>
        </article>`;
      })
      .join('');
  };

  // Pay the amount due (Razorpay); the server works out the amount.
  $('[data-orders]').addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pay]');
    if (!btn) return;
    const o = orders[Number(btn.dataset.pay)];
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Opening payment…';
    try {
      const token = await api.accessToken();
      if (!token) throw new Error('Your sign-in has expired. Please sign in again.');
      const start = await callFn<CheckoutStart>('pay-order', token, { orderId: o.id });
      const r = await pay(start, token);
      if (r.status !== 'closed') {
        flash(r.status === 'paid' ? `Thank you! Payment received for ${r.orderNumber}.` : `Thank you! Your payment for ${r.orderNumber} is being confirmed.`);
        await refreshOrders();
      }
    } catch (err) {
      alert(message(err));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  const flash = (text: string) => {
    const box = $('[data-flash]');
    box.textContent = text;
    box.hidden = !text;
  };
  const refreshOrders = async () => {
    const r = await api.myOrders();
    orders = r.orders;
    business = r.business;
    renderOrders();
  };

  // Invoice PDF made in the browser with the same code as the app (jsPDF loads only when asked).
  $('[data-orders]').addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-invoice]');
    if (!btn) return;
    const o = orders[Number(btn.dataset.invoice)];
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Making PDF…';
    try {
      const { buildInvoiceModel, renderInvoicePdf } = await import('@honeypackers/box-core/invoice');
      const model = buildInvoiceModel(o, me ?? undefined, invoiceCompany(business), o.invoiceNo!);
      const { bytes, fileName } = await renderInvoicePdf(model);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (err) {
      alert(`Could not make the invoice: ${message(err)}`);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  async function openAccount() {
    show('loading');
    try {
      me = await api.link();
      const r = await api.myOrders();
      orders = r.orders;
      business = r.business;
      renderWho();
      renderOrders();
      show('account');
      if (!me.name) openProfile(true);
      // Came here to sign in from the price page: go back there.
      const back = new URLSearchParams(location.search).get('return');
      if (back && back.startsWith('/') && !back.startsWith('//') && me.name) location.href = back;
      const done = new URLSearchParams(location.search).get('paid');
      if (done) flash(`Thank you! Order ${done} is placed. We'll confirm the delivery date.`);
    } catch (err) {
      show('phone');
      setError(phoneForm, message(err));
    }
  }

  show('loading');
  try {
    if (await api.signedInPhone()) return void (await openAccount());
  } catch {
    /* not signed in */
  }
  show('phone');
}
