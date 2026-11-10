import { GST_STATES, stateName } from '@honeypackers/box-core/gst';

/**
 * Delivery address in separate fields (like the big shopping sites), stored as one text so the admin, invoices
 * and dispatch keep working unchanged:
 *   12, Sri Ram Nagar           ← house / building
 *   Main Road, Thirukokarnam    ← area / street
 *   Landmark: Near bus stand    ← optional
 *   Pudukkottai, Tamil Nadu - 622001
 * parseAddress turns that text back into fields; any other (older, hand-typed) address lands in the first two lines.
 */
export interface AddressParts {
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  pincode: string;
  stateCode: string;
}

export const emptyAddress = (): AddressParts => ({ line1: '', line2: '', landmark: '', city: '', pincode: '', stateCode: '' });

const clean = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
const LANDMARK = /^landmark\s*:\s*/i;
const NAME_TO_CODE = new Map(Object.entries(GST_STATES).map(([code, name]) => [name.toLowerCase(), code]));

export function composeAddress(p: AddressParts): string {
  const pin = clean(p.pincode).replace(/\D/g, '');
  const state = stateName(p.stateCode);
  const place = [clean(p.city), state].filter(Boolean).join(', ') + (pin ? `${clean(p.city) || state ? ' - ' : ''}${pin}` : '');
  return [clean(p.line1), clean(p.line2), clean(p.landmark) ? `Landmark: ${clean(p.landmark)}` : '', place].filter(Boolean).join('\n');
}

export function parseAddress(text: string, stateCode = ''): AddressParts {
  const out = { ...emptyAddress(), stateCode };
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
  if (!lines.length) return out;
  const last = lines[lines.length - 1].match(/^(.*?)\s*-\s*(\d{6})$/);
  if (last && lines.length > 1) {
    lines.pop();
    out.pincode = last[2];
    const parts = last[1].split(',').map(clean).filter(Boolean);
    const code = parts.length > 1 ? NAME_TO_CODE.get(parts[parts.length - 1].toLowerCase()) : undefined;
    if (code) {
      parts.pop();
      out.stateCode = stateCode || code;
    }
    out.city = parts.join(', ');
  }
  const lm = lines.findIndex((l) => LANDMARK.test(l));
  if (lm >= 0) out.landmark = lines.splice(lm, 1)[0].replace(LANDMARK, '');
  out.line1 = lines[0] || '';
  out.line2 = lines.slice(1).join(', ');
  return out;
}

/** What is still missing, or '' when the address is complete. */
export function addressProblem(p: AddressParts, needPincode = true): string {
  if (!clean(p.line1)) return 'Add the house / flat number and building.';
  if (!clean(p.line2)) return 'Add the area or street.';
  if (!clean(p.city)) return 'Add the town or city.';
  if (needPincode && !/^\d{6}$/.test(clean(p.pincode))) return 'Add a 6-digit pincode.';
  if (!GST_STATES[p.stateCode]) return 'Choose the state.';
  return '';
}

/** Read the fields of components/AddressFields.astro inside `root` (pincode from `[name=pincode]`). */
export function readAddressFields(root: ParentNode): AddressParts {
  const v = (n: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${n}]`)?.value || '';
  return { line1: v('addr_line1'), line2: v('addr_line2'), landmark: v('addr_landmark'), city: v('addr_city'), pincode: v('pincode'), stateCode: v('stateCode') };
}

/** Fill the fields; empty fields only unless `overwrite` (so the buyer's typing is never replaced). */
export function fillAddressFields(root: ParentNode, p: AddressParts, overwrite = false) {
  const set = (n: string, val: string) => {
    const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${n}]`);
    if (el && (overwrite || (val && !el.value))) el.value = val;
  };
  set('addr_line1', p.line1);
  set('addr_line2', p.line2);
  set('addr_landmark', p.landmark);
  set('addr_city', p.city);
  set('pincode', p.pincode);
  set('stateCode', p.stateCode);
}
