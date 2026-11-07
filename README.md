# honeypackers.in

Website and (later) online shop for **Honey Packers**, corrugated box manufacturer.
Astro static site on Netlify, started from `rajesh-hub/templates/site`. Prices come from the **BoxBook** app's web price list.

## Pages
| Page | What |
|---|---|
| `/` | Home: what we make, how ordering works, FAQ (with FAQ structured data) |
| `/custom-box/` | **Price your box**: size, grade, printing, quantity, pincode → live 3D box, price per box, quantity slabs, BS, weight, delivery, GST, total. Order on WhatsApp or send as enquiry. Inputs are kept in the URL, so a link can be shared. |
| `/box-strength-calculator/` | Free BS / weight / cut size / deckle calculator (search traffic) |
| `/contact/` | Enquiry form (Netlify Forms), pre-filled from the price page |
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

## Next
- Online payment (Razorpay) and buyer accounts once Supabase is set up (plan: BoxBook `docs/online-business-plan.md`).
- Standard boxes in packs (products), Tamil pages, guides per industry, Google Business Profile.
