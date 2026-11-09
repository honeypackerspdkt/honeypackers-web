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
  /** What the buyer designed, in words (logo / texts). */
  artwork?: string;
}

/** Printing in words: plain, 1 colour or multicolour. */
export const printWords = (colours: number) => (colours <= 0 ? 'plain' : colours === 1 ? '1 colour' : 'multicolour');

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function quoteText(q: QuoteTextInput): string {
  const lines = [
    `Hi${q.business ? ` ${q.business}` : ''}, I'd like a quote for corrugated boxes:`,
    `• Size: ${q.size.length} × ${q.size.width} × ${q.size.height} mm (inside L × W × H)`,
    q.grade && `• Board: ${q.grade}${q.bs ? ` (BS ${q.bs})` : ''}`,
    `• Printing: ${printWords(q.colours)}`,
    q.artwork && `• Artwork: ${q.artwork}`,
    `• Quantity: ${q.qty.toLocaleString('en-IN')} boxes`,
    q.unitPrice != null && `• Website price: ₹${inr.format(q.unitPrice)} per box + GST`,
    q.pincode && `• Delivery pincode: ${q.pincode}`,
    q.url && `\n${q.url}`,
  ];
  return lines.filter(Boolean).join('\n');
}
