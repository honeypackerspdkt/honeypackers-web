// Inline SVG icons (Lucide-style, 24px grid, stroke = currentColor). Used in Astro (set:html) and in browser scripts.
const svg = (d: string, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  cart: (s?: number) => svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>', s),
  user: (s?: number) => svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', s),
  search: (s?: number) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  menu: (s?: number) => svg('<path d="M4 7h16M4 12h16M4 17h16"/>', s),
  close: (s?: number) => svg('<path d="M18 6 6 18M6 6l12 12"/>', s),
  truck: (s?: number) => svg('<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>', s),
  shield: (s?: number) => svg('<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>', s),
  receipt: (s?: number) => svg('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>', s),
  box: (s?: number) => svg('<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>', s),
  ruler: (s?: number) => svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>', s),
  check: (s?: number) => svg('<path d="M20 6 9 17l-5-5"/>', s),
  minus: (s?: number) => svg('<path d="M5 12h14"/>', s),
  plus: (s?: number) => svg('<path d="M12 5v14M5 12h14"/>', s),
  arrow: (s?: number) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s),
  print: (s?: number) => svg('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>', s),
  layers: (s?: number) => svg('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>', s),
};
