/**
 * Brand colour of the shop. The logo's rust-brown by default; set PUBLIC_BRAND_COLOR in Netlify to a preset name
 * (logo, kraft, forest, ocean, charcoal, maroon, teal) or any hex colour, then redeploy.
 * A colour too light for white button text is darkened until it reads well (WCAG AA, 4.5:1).
 */
export const PRESETS: Record<string, string> = {
  logo: '#8a3404', // rust-brown of the Honey Packers logo (default)
  kraft: '#8a5524',
  forest: '#2f6b45',
  ocean: '#24527a',
  charcoal: '#3a3a3a',
  maroon: '#7a2632',
  teal: '#1f6f6b',
};

const hex6 = (h: string) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${s.toLowerCase()}`;
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
/** Contrast of white text on this colour. */
export const whiteContrast = (hex: string) => 1.05 / (luminance(hex) + 0.05);

function darken(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const d = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${d((n >> 16) & 255)}${d((n >> 8) & 255)}${d(n & 255)}`;
}

export function brandColor(setting: string | undefined): string {
  const raw = (setting || '').trim().toLowerCase();
  let c = PRESETS[raw] || hex6(raw) || PRESETS.logo;
  for (let i = 0; i < 40 && whiteContrast(c) < 4.5; i++) c = darken(c, 0.93);
  return c;
}
