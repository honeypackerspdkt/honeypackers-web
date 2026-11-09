# honeypackers-web: handoff for Claude Code

Website for Honey Packers (corrugated boxes): Astro 7 static site on Netlify, from `rajesh-hub/templates/site`.
Overall plan: BoxBook repo `docs/online-business-plan.md`. App + database + shared maths live in the BoxBook repo.

## Working with the owner
- Always ask questions as selectable choices (AskUserQuestion), never as open-ended text questions.

## Layout
- Home (`index`): light hero in the logo's colours where a CSS 3D carton turns and opens on scroll (`scripts/home.ts`,
  `styles/home.css`, colours from `--stage*` / `--orange*` / `--carton*` tokens in `brand.css`), then a catalogue laid out like a
  packaging store (owner's reference: upack.in, layout only): 3 promo banners, 6 packaging-category tiles (drawn boxes, link to
  `/shop/?ply=n` or the builder), ready-to-order tiles, box builder (`lib/box-builder.ts`: real price via box-core `priceCustomBox`,
  order link to `/custom-box/`, enquiry text; `/?box=diecut|printed#configure` presets it), service badges, quote band (`EnquiryForm`), FAQ.
  Header has a category bar (`catNav` in `site.ts`) on every page.
  Logo `public/honey-packers-logo-header.webp` (cropped from `honey-packers-logo-precision.webp`), PNG icons, `site.webmanifest`, OG image.
- Storefront: `src/pages`: `index` (home), `shop` (grid + filters/sort/search), `products/[slug]` (static product pages) +
  `product/` (any product by `?p=`), `checkout` (one page: boxes, delivery, inline SMS sign-in + details, pay), `custom-box`, `account`,
  `contact`, `thanks`, `privacy`, `404`. `public/_redirects`: `/cart/` → `/checkout/`, `/products/` → `/shop/`, `/box-strength-calculator/` (removed, owner's choice) → `/custom-box/`.
- Shared UI: `components/Header.astro` (promo strip, search, menu, account, cart badge), `components/CartDrawer.astro` (<dialog> mini cart),
  `components/Footer.astro` (trust strip + footer). `lib/icons.ts` (inline SVG), `lib/catalog.ts` (products + price list loaded once per page,
  `productHref`, `fromPrice`), `lib/product-card.ts` (`productTile`), `lib/product-page.ts` (`productPageHtml`, `initProductPage`, `productJsonLd`),
  `lib/add-to-cart.ts`, `scripts/product.ts`, `scripts/checkout.ts`.
- Theme: `lib/theme.ts` `brandColor(PUBLIC_BRAND_COLOR)` (presets or hex, darkened to 4.5:1 for white text); `Base.astro` sets `--brand`;
  every colour in `brand.css` is mixed from `--brand`.
- `src/scripts/configurator.ts`: all price-page logic (no framework). `src/lib/box-svg.ts`: 3D box as an SVG string (box-core geometry,
  colours via CSS classes `.bx-*` in `brand.css`). `src/lib/price-list.ts`: live list from Supabase REST or the sample JSON (`fromDb` maps rows).
  `src/lib/quote-text.ts`: WhatsApp / enquiry text.
- My orders (`/account/`): `src/lib/account.ts` (pure: rows → orders, totals, re-order, invoice company from `public_business`),
  `src/lib/account-api.ts` (lazy supabase-js: SMS sign-in `+91…`, `buyer_link` RPC, own orders via RLS), `src/scripts/account.ts` (UI).
  The SMS goes through BoxBook's `send-sms-msg91` hook. jsPDF is a site dependency (deduped in astro.config) for the invoice PDF.
- Payments: `netlify/lib/shop.ts` (`createShop`: payOrder, checkoutCustom, verifyPayment, webhook, paymentLink; HMAC checks; amounts from
  box-core, never from the browser) + thin `netlify/functions/*.mts`; browser side `src/lib/pay.ts` (Razorpay checkout.js). SQL in BoxBook
  `…07_payments.sql` (`web_create_order`, `record_razorpay_payment`, service role only). Setup in README → Online payment.
- Products + cart: `src/lib/products.ts` (rows → Product, live/sample load, browser cart in localStorage `hp-cart`), `src/lib/product-card.ts`
  (tile HTML shared by build and browser), pages `shop` / `products/[slug]` / `checkout`; server `checkoutCart` in `netlify/lib/shop.ts` uses box-core `priceCart`.
- Printing + artwork (`/custom-box/`): Plain / 1 colour / Multicolour (box-core `artwork.ts`: `printColours` prices multicolour at
  `printing.maxColours`). `scripts/artwork-designer.ts`: side tabs (front/right/back/left/top/bottom, box-core `box3d` `BOX_SIDES`,
  `sideSize`) and a canvas of the chosen side where the buyer adds a logo (PNG/JPG/WebP, one picture for the whole box) and texts,
  drags/resizes them; kept in sessionStorage (survives sign-in). Each printed side is rendered to a transparent blob picture and
  `box-svg.ts` wraps it onto that side of the 3D box (`sideOnScreen`, affine + clip); choosing a side turns the box to `SIDE_VIEW`.
  The order preview PNG shows every printed side with its name and size. At checkout the design + logo + preview PNG go to
  `checkout-custom`; `shop.ts` checks them (`cleanArtwork`, `imageFromDataUrl`), uploads to storage `private/<org>/artwork/<uuid>/` and
  passes `p_artwork` to `web_create_order` (orders.artwork). Links use `?p=plain|one|multi` (old `?c=n` still read).
- Enquiries: Netlify Forms + `netlify/functions/submission-created.mts` (`netlify/lib/enquiry.ts`) → Supabase `enquiries` → BoxBook Inbox.
- `src/site.ts`: business details from `PUBLIC_*` env vars, nav. `src/styles/brand.css`: brand colours (override hub token variables only) + site components.
- Admin: the BoxBook app is built into `dist/admin/` by `scripts/build-admin.sh` (run by `netlify-build.sh` after the site build;
  `VITE_SUPABASE_*` default to the site's `PUBLIC_SUPABASE_*`, `VITE_SHOP_URL` to Netlify's `URL`). Served at `/admin/`, noindex.
  Supabase project "honeypackerspdkt's Project" (ref `gvsjdrsydgbkdxrgmlmb`, Mumbai, org honeypackerspdkt) holds BoxBook's migrations 01–09 (the earlier `wungbckyjamjwbxrfkle` project in Paavai-Embroidery is no longer used).
- Linked deps (`file:`): `../rajesh-hub/packages/{tokens,web-growth}`, `../BoxBook/packages/box-core`. Netlify clones them (`scripts/netlify-build.sh`).

## Rules
- Prices only through box-core (`priceCustomBox` etc.); never re-implement box maths here.
- No hard-coded brand colours outside `brand.css` token overrides. Font: Manrope everywhere (owner's choice, matches the
  cinematic preview), set by `--font-body` / `--font-head` in `brand.css`; Mukta Malar stays loaded only as the Tamil fallback.
- Colours come from the logo: white ground, rust-brown `--brand` #8a3404 (lettering, buttons, small text), orange `--orange` #f98104
  (highlights only; `--orange-ink` for large orange text, never small text: contrast). Drawn boxes (`.box3d`) stay cardboard-coloured.
- The following carton, background words and chapter slide-ins below the hero are in `scripts/home.ts` `motion()`, ported from the
  owner's preview (`git show e4b5979:public/honey-packers-preview.html`). Grids slide in as one piece (`chap-item` on the grid, not the cards).
- No made-up business facts (years, certifications, clients, address). Business details come from env / Company profile.
- Checks before pushing: `npm test`, `npm run check`, `npm run build`; drive `/custom-box/` in Playwright for UI changes.
