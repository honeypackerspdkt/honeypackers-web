// Razorpay Checkout in the browser. The amount and Razorpay order come from our server function;
// the result is confirmed by the server (verify-payment) and, independently, by Razorpay's webhook.

export interface CheckoutStart {
  keyId: string;
  razorpayOrderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  orderId: string;
  orderNumber: string;
  prefill?: { contact?: string; email?: string };
  notes?: Record<string, string>;
}

type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void; on(ev: string, fn: (r: unknown) => void): void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loading: Promise<RazorpayCtor> | null = null;
function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Payment window did not load')));
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check the internet connection.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** POST to one of our functions with the buyer's sign-in. */
export async function callFn<T>(name: string, token: string, body: unknown): Promise<T> {
  const r = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const out = (await r.json().catch(() => ({}))) as T & { error?: string };
  // 404: the payment server is not running here (plain local preview without Netlify Functions)
  if (r.status === 404 && !out.error) throw new Error('Online payment is not available on this preview. Please pay on the live website.');
  if (!r.ok && r.status !== 202) throw new Error(out.error || 'Something went wrong. Please try again.');
  return out;
}

export type PayResult = { status: 'paid' | 'pending' | 'closed'; orderNumber: string };

/** Opens Razorpay for a prepared order; resolves when paid (or still being confirmed), or closed by the buyer. */
export async function pay(start: CheckoutStart, token: string, color = '#8a5524'): Promise<PayResult> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const rz = new Razorpay({
      key: start.keyId,
      amount: start.amount,
      currency: start.currency,
      name: start.name,
      description: start.description,
      order_id: start.razorpayOrderId,
      prefill: start.prefill,
      notes: start.notes,
      theme: { color },
      handler: (r: Record<string, string>) => {
        callFn<{ status: 'paid' | 'pending'; orderNumber: string }>('verify-payment', token, r).then(resolve, reject);
      },
      modal: { ondismiss: () => resolve({ status: 'closed', orderNumber: start.orderNumber }) },
    });
    rz.on('payment.failed', () => {
      /* Razorpay shows the reason and lets the buyer try again in the same window */
    });
    rz.open();
  });
}
