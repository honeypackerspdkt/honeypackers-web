/** WhatsApp / enquiry text for a box request, in the style of BoxBook's share text. */
export interface QuoteTextInput {
  business: string;
  size: { length: number; width: number; height: number };
  grade: string;
  colours: number;
  qty: number;
  unitPrice?: number;
  bs?: number;
  pincode?: string;
  url?: string;
}

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function quoteText(q: QuoteTextInput): string {
  const lines = [
    `Hi${q.business ? ` ${q.business}` : ''}, I'd like a quote for corrugated boxes:`,
    `• Size: ${q.size.length} × ${q.size.width} × ${q.size.height} mm (inside L × W × H)`,
    q.grade && `• Board: ${q.grade}${q.bs ? ` (BS ${q.bs})` : ''}`,
    `• Printing: ${q.colours > 0 ? `${q.colours} colour${q.colours > 1 ? 's' : ''}` : 'plain'}`,
    `• Quantity: ${q.qty.toLocaleString('en-IN')} boxes`,
    q.unitPrice != null && `• Website price: ₹${inr.format(q.unitPrice)} per box + GST`,
    q.pincode && `• Delivery pincode: ${q.pincode}`,
    q.url && `\n${q.url}`,
  ];
  return lines.filter(Boolean).join('\n');
}
