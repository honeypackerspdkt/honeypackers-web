import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://honeypackers.in',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  vite: {
    // @rajesh-hub/* and @honeypackers/box-core are linked from sibling checkouts (../rajesh-hub, ../BoxBook).
    server: {
      fs: { allow: ['..'] },
      // one localhost for the site and the admin: /admin/ goes to the admin's own Vite server (npm run dev:all starts both)
      proxy: { '/admin': { target: 'http://localhost:5175', ws: true, changeOrigin: true } },
    },
    // box-core's invoice code imports these; resolve them from this site's node_modules (Netlify does not install BoxBook's).
    resolve: { dedupe: ['jspdf'] },
  },
});
