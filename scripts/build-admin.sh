#!/usr/bin/env bash
# Builds the Honey Packers admin app (admin/, copied from BoxBook) into dist/admin/, so one Netlify deploy
# serves the shop at / and the admin at /admin/. Both use the same Supabase project.
#   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY default to the site's PUBLIC_SUPABASE_* values.
#   VITE_SHOP_URL defaults to Netlify's URL (the site itself), for payment links from the app.
# Run after `npm run build`. Skip with SKIP_ADMIN=1.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${SKIP_ADMIN:-}" = "1" ] && { echo "admin: skipped (SKIP_ADMIN=1)"; exit 0; }
[ -f dist/index.html ] || { echo "admin: build the site first (npm run build)"; exit 1; }

# Local runs read the site's .env; on Netlify the variables are already in the environment.
envval() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }
PUBLIC_SUPABASE_URL="${PUBLIC_SUPABASE_URL:-$(envval PUBLIC_SUPABASE_URL)}"
PUBLIC_SUPABASE_ANON_KEY="${PUBLIC_SUPABASE_ANON_KEY:-$(envval PUBLIC_SUPABASE_ANON_KEY)}"

export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${PUBLIC_SUPABASE_URL:-}}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${PUBLIC_SUPABASE_ANON_KEY:-}}"
export VITE_SHOP_URL="${VITE_SHOP_URL:-${URL:-https://honeypackers.in}}"

# The admin's UI comes from the hub (@rajesh-hub/ui), which needs its own packages installed.
if [ ! -d ../rajesh-hub/node_modules ]; then (cd ../rajesh-hub && (npm ci || npm install)); fi
if [ ! -d admin/node_modules ]; then (cd admin && (npm ci || npm install)); fi
(cd admin && npm run build)

rm -rf dist/admin
cp -R admin/dist dist/admin
echo "admin: built into dist/admin/ (cloud sync: $([ -n "$VITE_SUPABASE_URL" ] && echo on || echo off))"
