import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://honeypackers.in',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: {
    // @rajesh-hub/* and @honeypackers/box-core are linked from sibling checkouts (../rajesh-hub, ../BoxBook).
    server: { fs: { allow: ['..'] } },
    // box-core's invoice code imports these; resolve them from this site's node_modules (Netlify does not install BoxBook's).
    resolve: { dedupe: ['jspdf'] },
  },
});
