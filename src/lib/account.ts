import { orderTotals } from '../../packages/box-core/src/calc';
import { defaultCompany } from '../../packages/box-core/src/company';
import type { CompanySettings, Customer, Order, OrderStatus } from '../../packages/box-core/src/types';

/** Buyer account ("My orders"): database rows → display data. Pure, tested in tests/account.test.ts. */

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

export const STATUS_TEXT: Record<OrderStatus, string> = {
  quote: 'Quotation',
  confirmed: 'Confirmed',
  production: 'Being made',
  ready: 'Ready for dispatch',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Indian mobile number as typed → 10 digits, or '' if it is not one. */
export function mobile10(input: string): string {
  const d = String(input || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

export function customerFromRow(r: Row): Customer {
  return {
    id: str(r.id),
    name: str(r.name),
    company: str(r.company),
    phone: str(r.phone),
    email: str(r.email),
    gstin: str(r.gstin),
    address: str(r.address),
    stateCode: str(r.state_code) || undefined,
    notes: '',
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

/** orders + order_items + payments rows (what RLS lets a buyer read) → Orders, newest first, deleted ones left out. */
export function ordersFromRows(orders: Row[], items: Row[], payments: Row[]): Order[] {
  const live = (r: Row) => r.deleted_at == null;
  return orders
    .filter(live)
    .map((o): Order => ({
      id: str(o.id),
      number: str(o.number),
      customerId: str(o.customer_id),
      date: str(o.date),
      dueDate: str(o.due_date),
      status: (str(o.status) || 'quote') as OrderStatus,
      items: items
        .filter((i) => live(i) && i.order_id === o.id)
        .sort((a, b) => num(a.position) - num(b.position))
        .map((i) => ({
          id: str(i.id),
          description: str(i.description),
          qty: num(i.qty),
          rate: num(i.rate),
          ...(i.hsn ? { hsn: str(i.hsn) } : {}),
          ...(i.unit ? { unit: str(i.unit) } : {}),
          ...(i.spec ? { spec: i.spec as Order['items'][number]['spec'] } : {}),
        })),
      discount: num(o.discount),
      taxPct: num(o.tax_pct),
      payments: payments.filter((p) => live(p) && p.order_id === o.id).map((p) => ({ id: str(p.id), date: str(p.date), amount: num(p.amount), mode: str(p.mode), note: str(p.note) })),
      notes: '',
      ...(o.invoice_no ? { invoiceNo: str(o.invoice_no) } : {}),
      ...(o.invoice && Object.keys(o.invoice as object).length ? { invoice: o.invoice as Order['invoice'] } : {}),
      createdAt: str(o.created_at),
      updatedAt: str(o.updated_at),
    }))
    .sort((a, b) => (a.date === b.date ? b.number.localeCompare(a.number) : b.date.localeCompare(a.date)));
}

export interface OrderView {
  order: Order;
  status: string;
  total: number;
  paid: number;
  due: number;
  canInvoice: boolean;
}

export function orderView(o: Order): OrderView {
  const t = orderTotals(o);
  return { order: o, status: STATUS_TEXT[o.status] || o.status, total: t.total, paid: t.paid, due: Math.max(0, Math.round(t.balance * 100) / 100), canInvoice: Boolean(o.invoiceNo) && o.status !== 'cancelled' };
}

/** Link to price the same box again (lines that carry a box spec). */
export function reorderLink(it: Order['items'][number]): string | null {
  const s = it.spec;
  if (!s || !(s.length > 0 && s.width > 0 && s.height > 0)) return null;
  const q = new URLSearchParams({ l: String(s.length), w: String(s.width), h: String(s.height), q: String(Math.max(1, Math.round(it.qty))) });
  return `/custom-box/?${q}`;
}

/** WhatsApp text to repeat an order. */
export function reorderText(o: Order, business: string, customerName: string): string {
  return [
    `Hi${business ? ` ${business}` : ''}, I'd like to repeat order ${o.number}${customerName ? ` (${customerName})` : ''}:`,
    ...o.items.map((i) => `• ${i.description} × ${i.qty.toLocaleString('en-IN')}`),
  ].join('\n');
}

/**
 * Company details for the buyer's copy of the GST invoice, from the public company view (public_business).
 * Bank details and the declaration are not public, so the defaults are used for those.
 */
export function invoiceCompany(pub: Row | null | undefined): CompanySettings {
  const p = pub || {};
  return {
    ...defaultCompany,
    businessName: str(p.business_name) || 'Honey Packers',
    businessTagline: str(p.business_tagline),
    businessAddress: str(p.business_address),
    businessPhone: str(p.business_phone),
    businessEmail: str(p.business_email),
    businessGstin: str(p.business_gstin),
    businessState: str(p.business_state) || defaultCompany.businessState,
    currency: str(p.currency) || defaultCompany.currency,
  };
}
