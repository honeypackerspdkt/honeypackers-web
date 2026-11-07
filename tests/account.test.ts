import { describe, expect, it } from 'vitest';
import { buildInvoiceModel } from '@honeypackers/box-core/invoice';
import { customerFromRow, invoiceCompany, mobile10, orderView, ordersFromRows, reorderLink, reorderText } from '../src/lib/account';

const orders = [
  { id: 'o1', number: 'ORD-0007', customer_id: 'c1', date: '2026-11-01', due_date: null, status: 'delivered', discount: '100.00', tax_pct: '5.00', invoice_no: 'HP/330', invoice: {}, created_at: 'x', updated_at: 'y', deleted_at: null },
  { id: 'o2', number: 'ORD-0009', customer_id: 'c1', date: '2026-11-05', due_date: '2026-11-12', status: 'production', discount: 0, tax_pct: 5, invoice_no: null, invoice: {}, deleted_at: null },
  { id: 'o3', number: 'ORD-0010', customer_id: 'c1', date: '2026-11-06', status: 'quote', deleted_at: '2026-11-06' },
];
const items = [
  { id: 'i2', order_id: 'o1', position: 1, description: 'Printing plate', qty: '1.000', rate: '1500.0000', deleted_at: null },
  { id: 'i1', order_id: 'o1', position: 0, description: '3 ply 300×200×150', qty: '500.000', rate: '12.8000', hsn: '48191010', unit: 'Nos.', spec: { length: 300, width: 200, height: 150, ply: 3, perLayer: false, layers: [] }, deleted_at: null },
  { id: 'i3', order_id: 'o2', position: 0, description: '5 ply 400×300×300', qty: 200, rate: 30, deleted_at: null },
  { id: 'gone', order_id: 'o2', position: 1, description: 'deleted line', qty: 1, rate: 1, deleted_at: 'z' },
];
const payments = [{ id: 'p1', order_id: 'o1', date: '2026-11-02', amount: '3000.00', mode: 'UPI', note: '', deleted_at: null }];

describe('my orders', () => {
  const list = ordersFromRows(orders, items, payments);

  it('builds orders from rows: newest first, deleted rows left out, lines in order, numbers as numbers', () => {
    expect(list.map((o) => o.number)).toEqual(['ORD-0009', 'ORD-0007']);
    expect(list[1].items.map((i) => i.description)).toEqual(['3 ply 300×200×150', 'Printing plate']);
    expect(list[1].items[0]).toMatchObject({ qty: 500, rate: 12.8, hsn: '48191010' });
    expect(list[0].items).toHaveLength(1);
    expect(list[1].invoiceNo).toBe('HP/330');
  });

  it('shows totals, amount due and whether an invoice can be downloaded', () => {
    // (500 × 12.8 + 1500 − 100) × 1.05 = 8,190; paid 3,000
    expect(orderView(list[1])).toMatchObject({ status: 'Delivered', total: 8190, paid: 3000, due: 5190, canInvoice: true });
    expect(orderView(list[0])).toMatchObject({ status: 'Being made', total: 6300, due: 6300, canInvoice: false });
  });

  it('re-order: price the same box again, or send the list on WhatsApp', () => {
    expect(reorderLink(list[1].items[0])).toBe('/custom-box/?l=300&w=200&h=150&q=500');
    expect(reorderLink(list[1].items[1])).toBeNull();
    expect(reorderText(list[1], 'Honey Packers', 'Kumar')).toBe("Hi Honey Packers, I'd like to repeat order ORD-0007 (Kumar):\n• 3 ply 300×200×150 × 500\n• Printing plate × 1");
  });

  it('the buyer’s invoice copy uses the public company details and the same GST maths as the app', () => {
    const company = invoiceCompany({ business_name: 'Honey Packers', business_gstin: '33AAAAA0000A1Z5', business_state: '33', currency: '₹' });
    const buyer = customerFromRow({ id: 'c1', name: 'Kumar Traders', gstin: '33ABCDE1234F1Z5', state_code: '33' });
    const m = buildInvoiceModel(list[1], buyer, company, 'HP/330');
    expect(m.number).toBe('HP/330');
    expect(m.total).toBe(8190);
    expect(company.bankAccount).toBe(''); // bank details are not public
  });

  it('accepts Indian mobile numbers as people type them', () => {
    expect(mobile10('98765 43210')).toBe('9876543210');
    expect(mobile10('+91 98765-43210')).toBe('9876543210');
    expect(mobile10('098765 43210')).toBe('9876543210');
    expect(mobile10('12345 67890')).toBe('');
    expect(mobile10('98765')).toBe('');
  });
});
