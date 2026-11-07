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
- `src/site.ts`: business details from `PUBLIC_*` env vars, nav. `src/styles/brand.css`: brand colours (override hub token variables only) + site components.
- Linked deps (`file:`): `../rajesh-hub/packages/{tokens,web-growth}`, `../BoxBook/packages/box-core`. Netlify clones them (`scripts/netlify-build.sh`).

## Rules
- Prices only through box-core (`priceCustomBox` etc.); never re-implement box maths here.
- No hard-coded brand colours outside `brand.css` token overrides; fonts from the hub.
- No made-up business facts (years, certifications, clients, address). Business details come from env / Company profile.
- Checks before pushing: `npm test`, `npm run check`, `npm run build`; drive `/custom-box/` in Playwright for UI changes.
