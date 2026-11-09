import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Honey Packers admin, served at honeypackers.in/admin/ (relative base). box-core lives in ../packages and the
// shared @rajesh-hub packages in ../../rajesh-hub, both outside this folder: let the dev server read them and
// make sure only one copy of React is used.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'sonner', '@supabase/supabase-js'] },
  server: { fs: { allow: ['..', '../..'] } },
})
