import { priceCustomBox, type Grade, type WebShop } from '@honeypackers/box-core/pricing';
import { printKindOf } from '@honeypackers/box-core/artwork';
import { printWords } from './quote-text';

/** What the home page box builder asks for. Sizes in `unit`; the price is always worked out in mm. */
export interface BuilderInput {
  style: 'rsc' | 'diecut' | 'other';
  unit: 'mm' | 'in';
  l: number;
  w: number;
  h: number;
  gradeId: string;
  colours: number;
  qty: number;
  /** Exact mm for sizes typed in mm and only shown in inches since (switching units must not turn 200 mm into 201). */
  mm?: Partial<Record<Dim, number>>;
}

type Dim = 'l' | 'w' | 'h';

export type BuilderResult =
  | { kind: 'price'; unitPrice: number; amount: number; bs: number; weightKg: number; orderHref: string }
  | { kind: 'quote'; message: string };

export const toMm = (v: number, unit: 'mm' | 'in') => Math.round(unit === 'in' ? v * 25.4 : v);

/** Size in mm: the exact mm the buyer typed when known, else the shown value converted. */
export const sizeMm = (i: BuilderInput, d: Dim) => i.mm?.[d] ?? toMm(i[d], i.unit);

export const gradesFor = (shop: WebShop, ply: number): Grade[] => shop.rules.grades.filter((g) => g.ply === ply);

/** Price from the shared box-core maths, or why it has to be quoted by hand. */
export function builderResult(i: BuilderInput, shop: WebShop): BuilderResult {
  if (i.style !== 'rsc') return { kind: 'quote', message: 'Die-cut and special boxes are priced by quote. Send your size and we’ll reply.' };
  if (!shop.showPrices) return { kind: 'quote', message: 'Send your size and we’ll reply with a price.' };
  const length = sizeMm(i, 'l');
  const width = sizeMm(i, 'w');
  const height = sizeMm(i, 'h');
  const r = priceCustomBox({ length, width, height, gradeId: i.gradeId, qty: i.qty, colours: i.colours }, shop.rules);
  if (!r.ok) return { kind: 'quote', message: r.message };
  const qs = new URLSearchParams({ l: String(length), w: String(width), h: String(height), g: i.gradeId, p: printKindOf(i.colours), q: String(r.qty) });
  return { kind: 'price', unitPrice: r.unitPrice, amount: r.amount, bs: r.box.bs, weightKg: r.weightKg, orderHref: `/custom-box/?${qs}` };
}

/** The text that goes into the enquiry form. */
export function builderText(i: BuilderInput, shop: WebShop, r: BuilderResult): string {
  const style = { rsc: 'Regular slotted carton (RSC)', diecut: 'Die-cut mailer box', other: 'Other / not sure' }[i.style];
  const grade = shop.rules.grades.find((g) => g.id === i.gradeId);
  return [
    `Box: ${style}`,
    i.unit === 'in'
      ? `Inside size: ${i.l} × ${i.w} × ${i.h} inch (${sizeMm(i, 'l')} × ${sizeMm(i, 'w')} × ${sizeMm(i, 'h')} mm)`
      : `Inside size: ${i.l} × ${i.w} × ${i.h} mm`,
    `Board: ${grade ? grade.label : '-'}`,
    `Printing: ${printWords(i.colours)}`,
    `Quantity: ${i.qty.toLocaleString('en-IN')} boxes`,
    r.kind === 'price' ? `Website price: ₹${r.unitPrice.toFixed(2)} a box + GST` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
