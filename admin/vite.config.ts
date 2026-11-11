import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Honey Packers admin, served at honeypackers.in/admin/ (relative base). box-core lives in ../packages and the
// shared @rajesh-hub packages in ../../rajesh-hub, both outside this folder: let the dev server read them and
// make sure only one copy of React is used.
// In development it runs under /admin/ (as on the live site), so the website's dev server can pass /admin/ through to it:
// `npm run dev:all` in the site folder serves both on one localhost (site :4322, admin at :4322/admin/).
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/admin/' : './',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'sonner', '@supabase/supabase-js'] },
  server: { fs: { allow: ['..', '../..'] } },
}))
