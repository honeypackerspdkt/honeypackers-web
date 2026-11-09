# Honey Packers cinematic website preview

This directory was added from the current Honey Packers live animated site.
It **does not replace** the existing Astro/Netlify storefront, shop, checkout, backend, or homepage.

## View it
- Locally after starting this repository Astro app: /honey-packers-preview.html
- On the deployed Astro/Netlify domain: /honey-packers-preview.html
- Original hosted reference: https://honey-packers-preview.higgsfield.app

## Source and assets
- public/honey-packers-preview.html: standalone HTML with embedded CSS and vanilla-JS scroll-driven 3D carton, transitions, and box configurator UI.
- public/honey-packers-logo-precision.webp: optimized transparent company logo for page display.
- public/honey-packers-icon-*.png: browser icons.
- public/honey-packers-og.jpg: sharing preview.
- public/site.webmanifest: metadata.

The animated preview includes a **demo-only enquiry form**; it does not submit enquiries to production. The existing Astro storefront's ecommerce and checkout functionality remains the place to manage live orders and payments.

The static assets are in public/ so Astro serves them without additional dependencies or changing routes. This preserves the current storefront while making the animated design available for review and subsequent integration.
