# honeypackers-web: handoff for Claude Code

Website for Honey Packers (corrugated boxes): Astro 7 static site on Netlify, from `rajesh-hub/templates/site`.
Overall plan: BoxBook repo `docs/online-business-plan.md`. App + database + shared maths live in the BoxBook repo.

## Working with the owner
- Always ask questions as selectable choices (AskUserQuestion), never as open-ended text questions.

## Layout
- `src/pages`: `index`, `custom-box` (price configurator), `box-strength-calculator`, `contact`, `thanks`, `privacy`, `404`.
- `src/scripts/configurator.ts`: all price-page logic (no framework). `src/lib/box-svg.ts`: 3D box as an SVG string (box-core geometry,
  colours via CSS classes `.bx-*` in `brand.css`). `src/lib/price-list.ts`: live list from Supabase REST or the sample JSON (`fromDb` maps rows).
  `src/lib/quote-text.ts`: WhatsApp / enquiry text.
- My orders (`/account/`): `src/lib/account.ts` (pure: rows → orders, totals, re-order, invoice company from `public_business`),
  `src/lib/account-api.ts` (lazy supabase-js: SMS sign-in `+91…`, `buyer_link` RPC, own orders via RLS), `src/scripts/account.ts` (UI).
  The SMS goes through BoxBook's `send-sms-msg91` hook. jsPDF is a site dependency (deduped in astro.config) for the invoice PDF.
- Payments: `netlify/lib/shop.ts` (`createShop`: payOrder, checkoutCustom, verifyPayment, webhook, paymentLink; HMAC checks; amounts from
  box-core, never from the browser) + thin `netlify/functions/*.mts`; browser side `src/lib/pay.ts` (Razorpay checkout.js). SQL in BoxBook
  `…07_payments.sql` (`web_create_order`, `record_razorpay_payment`, service role only). Setup in README → Online payment.
- Enquiries: Netlify Forms + `netlify/functions/submission-created.mts` (`netlify/lib/enquiry.ts`) → Supabase `enquiries` → BoxBook Inbox.
- `src/site.ts`: business details from `PUBLIC_*` env vars, nav. `src/styles/brand.css`: brand colours (override hub token variables only) + site components.
- Linked deps (`file:`): `../rajesh-hub/packages/{tokens,web-growth}`, `../BoxBook/packages/box-core`. Netlify clones them (`scripts/netlify-build.sh`).

## Rules
- Prices only through box-core (`priceCustomBox` etc.); never re-implement box maths here.
- No hard-coded brand colours outside `brand.css` token overrides; fonts from the hub.
- No made-up business facts (years, certifications, clients, address). Business details come from env / Company profile.
- Checks before pushing: `npm test`, `npm run check`, `npm run build`; drive `/custom-box/` in Playwright for UI changes.
