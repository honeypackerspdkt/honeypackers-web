import { mobile10 } from './account';
import type { SignInTarget } from './account-api';

const NOTE = {
  wa: "We'll send a 6-digit code on WhatsApp. No password needed.",
  email: "We'll e-mail you a sign-in link and code. No password needed.",
};

/** Wires the WhatsApp / e-mail switch in a form that contains components/SignInFields.astro. */
export function bindSignInForm(form: HTMLFormElement) {
  const via = () => (form.querySelector<HTMLInputElement>('input[name=via]:checked')?.value === 'email' ? 'email' : 'wa');
  const sync = () => {
    const v = via();
    form.querySelectorAll<HTMLElement>('[data-via-field]').forEach((el) => (el.hidden = el.dataset.viaField !== v));
    const note = form.querySelector<HTMLElement>('[data-via-note]');
    if (note) note.textContent = NOTE[v];
  };
  form.querySelectorAll('input[name=via]').forEach((r) => r.addEventListener('change', () => (sync(), form.querySelector<HTMLInputElement>(via() === 'wa' ? '[name=mobile]' : '[name=signin_email]')?.focus())));
  sync();
  return {
    /** The target from the form, or an error message to show. */
    read(): SignInTarget | string {
      if (via() === 'wa') {
        const mobile = mobile10(form.querySelector<HTMLInputElement>('[name=mobile]')!.value);
        return mobile ? { via: 'wa', mobile } : 'Enter a 10-digit Indian mobile number.';
      }
      const email = form.querySelector<HTMLInputElement>('[name=signin_email]')!.value.trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { via: 'email', email } : 'Enter your e-mail address.';
    },
  };
}

/** "+91 98765 43210 on WhatsApp" / "you@x.com" for the code step. */
export const targetLabel = (t: SignInTarget) => (t.via === 'wa' ? `+91 ${t.mobile.slice(0, 5)} ${t.mobile.slice(5)} on WhatsApp` : t.email);

/** Hint under the code box. */
export const codeHint = (t: SignInTarget) => (t.via === 'wa' ? 'Enter the 6-digit code from WhatsApp.' : 'Enter the 6-digit code from the e-mail, or just click the link in it.');
