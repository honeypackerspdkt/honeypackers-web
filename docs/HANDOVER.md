# Handover: run honeypackers.in locally (Claude Code on your computer)

Give Claude Code this file, or paste the prompt at the bottom.

## What this is
- **honeypackers-web** (this repo, branch `main`): the Honey Packers website / online shop. Astro 7 static site + Netlify Functions.
- It links two sibling repos with `file:` dependencies, so all three must sit **in the same parent folder**:
  ```
  <parent>/
    honeypackers-web/   ← this repo (main)
    BoxBook/            ← app + database + shared box maths, branch claude/loving-allen-f3sugi
    rajesh-hub/         ← shared design tokens + web components (main)
  ```
- Project rules and file map: `CLAUDE.md` in this repo. Business plan + launch steps: `BoxBook/docs/online-business-plan.md`, `BoxBook/docs/launch-checklist.md`.

## Needs
- Node.js 22 (`node -v`), npm, Git.
- Optional for the database tests in BoxBook: PostgreSQL (`npm run db:test` in BoxBook).

## Set up (first time)
```bash
mkdir honeypackers && cd honeypackers
git clone https://github.com/yuvarajeshsp-cloud/honeypackers-web.git
git clone https://github.com/yuvarajeshsp-cloud/rajesh-hub.git
git clone -b claude/loving-allen-f3sugi https://github.com/yuvarajeshsp-cloud/BoxBook.git
cd honeypackers-web
npm install
```
(Or, from inside `honeypackers-web`: `BOXBOOK_REF=claude/loving-allen-f3sugi bash scripts/netlify-build.sh`, which clones the two siblings, installs, tests and builds, the same way Netlify does.)

**Important:** BoxBook's `main` does not have `packages/box-core` yet. Use the branch `claude/loving-allen-f3sugi` until it is merged.

## Run
| Command | What |
|---|---|
| `npm run dev` | Dev server with live reload: http://localhost:4321 |
| `npm run build && npx astro preview` | The real built site: http://localhost:4321 |
| `npx astro preview --host` | Same, reachable from your phone on the same Wi-Fi (use the "Network" address) |
| `npm test` | Unit tests (vitest, 36 tests) |
| `npm run check` | Type check (`astro check`, expect 0 errors) |

Optional: `cp .env.example .env` and fill in `PUBLIC_BUSINESS_NAME`, `PUBLIC_BUSINESS_PHONE`, `PUBLIC_WHATSAPP_NUMBER`, etc., to see your own details;
`PUBLIC_BRAND_COLOR` (kraft, forest, ocean, charcoal, maroon, teal or a hex) to try another colour.

## What to test locally
- Home `/`: dark hero, the carton turns and opens as you scroll; box builder (size, mm/inch, ply, grade, printing, quantity → price);
  "Order & pay online" opens `/custom-box/` with the same price; the quote form is filled with the box details.
- Shop `/shop/` (filters, sort, search), a product page, Add to cart → mini cart, `/checkout/` (shows "Send order on WhatsApp" without payments).
- `/custom-box/`, `/box-strength-calculator/`, `/contact/`, `/account/` (says sign-in isn't set up without Supabase).
- Phone width (390 px): no sideways scrolling; menu works.

## What does NOT work locally (expected)
- Prices and products are **sample data** until Supabase is set up (`src/data/sample-*.json`).
- Enquiry form sending, `public/_redirects`, Netlify Functions (payments, webhooks, enquiry → Supabase): only on Netlify,
  or locally with `npx netlify dev` (Netlify CLI, needs a Netlify login).
- SMS sign-in, My orders, online payment: need Supabase + MSG91 + Razorpay keys (see the launch checklist). **Never** put secret keys
  (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, webhook secrets) in `PUBLIC_*` variables.

## State at handover (9 Nov 2026)
- `honeypackers-web` `main`: storefront redesign + the owner's cinematic home page (commit `19e846c`). Not deployed yet.
- `BoxBook` `claude/loving-allen-f3sugi`: app, cloud sync, staff roles, Inbox, products, Supabase schema (not applied to a real project yet).
- Next steps: deploy on Netlify (launch checklist Stage 1, set `BOXBOOK_REF=claude/loving-allen-f3sugi`), or merge the BoxBook branch into `main`.

## Prompt to paste into Claude Code
> Read `docs/HANDOVER.md` and `CLAUDE.md` in honeypackers-web. Make sure `BoxBook` (branch `claude/loving-allen-f3sugi`) and
> `rajesh-hub` are cloned next to it, run `npm install`, `npm test`, `npm run check` and `npm run build`, then start
> `npx astro preview --host` and tell me the addresses to open on my computer and phone. Ask me questions as selectable choices.
