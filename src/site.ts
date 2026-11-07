// Business details for the site. Set them in .env (see .env.example) / Netlify environment variables.
// Empty values are simply not shown. Later they come from BoxBook's Company profile (Supabase public_business).
const env = import.meta.env;
const clean = (v: string | undefined) => (v ?? '').trim();

export const site = {
  name: clean(env.PUBLIC_BUSINESS_NAME) || 'Honey Packers',
  tagline: clean(env.PUBLIC_BUSINESS_TAGLINE) || 'Corrugated boxes made to your size',
  phone: clean(env.PUBLIC_BUSINESS_PHONE),
  whatsapp: clean(env.PUBLIC_WHATSAPP_NUMBER).replace(/\D/g, ''),
  email: clean(env.PUBLIC_BUSINESS_EMAIL),
  address: clean(env.PUBLIC_BUSINESS_ADDRESS),
  city: clean(env.PUBLIC_BUSINESS_CITY),
  gstin: clean(env.PUBLIC_BUSINESS_GSTIN),
  grievanceOfficer: clean(env.PUBLIC_GRIEVANCE_OFFICER),
  url: 'https://honeypackers.in',
};

export const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
export const waHref = (number: string, text?: string) => `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const nav = [
  { href: '/custom-box/', label: 'Price your box' },
  { href: '/products/', label: 'Boxes in packs' },
  { href: '/box-strength-calculator/', label: 'Strength calculator' },
  { href: '/contact/', label: 'Contact' },
  { href: '/account/', label: 'My orders' },
];
