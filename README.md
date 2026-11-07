# honeypackers.in

Website and (later) online shop for **Honey Packers**, corrugated box manufacturer.
Astro static site on Netlify, started from `rajesh-hub/templates/site`. Prices come from the **BoxBook** app's web price list.

## Pages
| Page | What |
|---|---|
| `/` | Home: what we make, how ordering works, FAQ (with FAQ structured data) |
| `/custom-box/` | **Price your box**: size, grade, printing, quantity, pincode → live 3D box, price per box, quantity slabs, BS, weight, delivery, GST, total. Order on WhatsApp or send as enquiry. Inputs are kept in the URL, so a link can be shared. |
| `/box-strength-calculator/` | Free BS / weight / cut size / deckle calculator (search traffic) |
| `/contact/` | Enquiry form (Netlify Forms), pre-filled from the price page. Each accepted submission is also saved to Supabase `enquiries` by `netlify/functions/submission-created.mts`, so it appears in the BoxBook app's Inbox |
| `/account/` | **My orders**: buyer signs in with mobile number + SMS code (MSG91, via Supabase), gives name/company/GSTIN/address, sees orders with status and amount due, downloads GST invoices (made in the browser with box-core), orders again. Off until the Supabase variables are set. |
| `/privacy/` | Privacy policy (**draft, review before going live**) |
| `/thanks/`, `/404` | |

## Where things come from
- **Box maths and pricing:** `@honeypackers/box-core` from the BoxBook repo (`packages/box-core`): `calcBox`, `priceCustomBox`,
  `slabTable`, `findZone`, `deliveryCharge`, `checkoutTotals`. Same code as the app, so the website price = the app price.
- **Prices:** live from Supabase (`price_rules`, `delivery_zones`, readable with the anon key) when `PUBLIC_SUPABASE_URL`,
  `PUBLIC_SUPABASE_ANON_KEY` and `PUBLIC_SHOP_ORG_ID` are set; otherwise `src/data/sample-price-list.json` and the page says **sample prices**.
  The owner edits prices in BoxBook → More → Web price list.
- **Look:** `@rajesh-hub/tokens/web.css` with the BoxBook carton-brown colours in `src/styles/brand.css`.
- **Growth:** `@rajesh-hub/web-growth`: WhatsApp button, cookie consent, Meta Pixel + Conversions API.
- **Business details:** `PUBLIC_*` variables (see `.env.example`); empty ones are not shown.

## Develop
Clone the two linked repos next to this one, then:
```bash
git clone https://github.com/yuvarajeshsp-cloud/rajesh-hub ../rajesh-hub
git clone https://github.com/yuvarajeshsp-cloud/BoxBook ../BoxBook     # box-core lives on BoxBook's branch until merged
npm install
npm run dev        # http://localhost:4321
npm test           # vitest: 3D drawing, price list loading, quote text, My orders (rows → orders, totals, invoice)
npm run check      # astro check (types)
npm run build
```

## Deploy (Netlify)
1. Netlify → Add new site → Import from GitHub → this repo. Build settings come from `netlify.toml`
   (`scripts/netlify-build.sh` clones rajesh-hub and BoxBook next to the site, runs the tests, then builds).
2. Environment variables: the `PUBLIC_*` business details, and when Supabase is live the three Supabase values.
   Private repos: add `GITHUB_TOKEN` (read-only). Until box-core is merged in BoxBook: `BOXBOOK_REF=claude/loving-allen-f3sugi`.
3. Forms → enable form detection; add an e-mail notification for the `enquiry` form.
4. Domain: add `honeypackers.in` and `www.honeypackers.in`, then HTTPS.

## Online payment (Razorpay)
Server functions in `netlify/functions` (logic in `netlify/lib/shop.ts`, tested in `tests/shop.test.ts` with fake Supabase and Razorpay):
| Function | Called by | Does |
|---|---|---|
| `pay-order` | My orders → "Pay ₹… now" | amount due on the buyer's own order (box-core totals) → Razorpay order |
| `checkout-custom` | price page → "Order & pay online" | prices the box again on the server, creates the website order (`web_create_order`), Razorpay order for the advance % (100% by default) |
| `verify-payment` | browser after paying | checks Razorpay's signature (key secret, `order_id|payment_id`) and records the payment if captured |
| `razorpay-webhook` | Razorpay | checks `X-Razorpay-Signature` (webhook secret) and records `order.paid` / `payment_link.paid` once (`record_razorpay_payment`) |
| `payment-link` | BoxBook app → "Send payment link" | office staff only; Razorpay payment link for the amount due |

Setup:
1. Razorpay dashboard: get the **Key ID** and **Key Secret** (test mode first).
2. Webhooks → add `https://honeypackers.in/.netlify/functions/razorpay-webhook`, events **order.paid** and **payment_link.paid**, set a webhook secret.
3. Netlify environment variables: `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   (plus the `PUBLIC_SUPABASE_*` and `PUBLIC_SHOP_ORG_ID` already used by the site). Never give these a `PUBLIC_` prefix.
4. BoxBook app: `VITE_SHOP_URL=https://honeypackers.in` in its `.env.local`, so "Send payment link" can reach the server.
5. Test with Razorpay test cards / UPI in test mode, check the payment appears in BoxBook, then switch to live keys.
Courier pincodes are not sold online yet (they go to enquiry) until courier rates are added.

## Next
- Online payment (Razorpay) and buyer accounts once Supabase is set up (plan: BoxBook `docs/online-business-plan.md`).
- Standard boxes in packs (products), Tamil pages, guides per industry, Google Business Profile.
