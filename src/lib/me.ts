/**
 * Who is signed in, remembered on this device for the header's account menu (so every page can greet the buyer
 * without loading supabase-js). Written after sign-in / profile saves, cleared on sign-out. The real check is
 * Supabase's own saved session (localStorage `sb-<project>-auth-token`); without it the buyer counts as signed out.
 */
export interface MeCache {
  name: string;
  /** "+91 98765 43210" or the e-mail address */
  contact: string;
}
const KEY = 'hp-me';

const hasSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
  } catch {
    /* storage blocked */
  }
  return false;
};

export function cachedMe(): MeCache | null {
  if (!hasSession()) return null;
  // only once this site has seen the sign-in (rememberMe); an old or expired session alone does not count
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as MeCache | null;
    return v && typeof v.contact === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function rememberMe(c: { name?: string; phone?: string; email?: string }) {
  const digits = (c.phone || '').replace(/\D/g, '').slice(-10);
  const contact = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : c.email || '';
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: (c.name || '').trim(), contact }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('me-change'));
}

export function forgetMe() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('me-change'));
}

/** Sign out everywhere on this device (header menu, account page, checkout). */
export async function signOutEverywhere() {
  const api = await import('./account-api');
  await api.signOut().catch(() => {});
  forgetMe();
}
