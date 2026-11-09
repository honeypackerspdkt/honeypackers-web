#!/usr/bin/env bash
# Netlify build: the site and the admin (admin/) use the shared hub with file: dependencies
#   ../rajesh-hub  (@rajesh-hub/tokens, web-growth; the admin's ui, print, supabase-kit)
# Netlify only checks out this repo, so clone it next to it first. Box maths are in packages/box-core (this repo).
# For private repos set GITHUB_TOKEN (read-only, fine-grained) in Netlify's environment variables.
# HUB_REF picks a branch (default: the repo's default branch).
set -euo pipefail
cd "$(dirname "$0")/.."

clone() { # url dir ref
  local url="$1" dir="$2" ref="${3:-}"
  [ -d "$dir/.git" ] && { echo "using existing $dir"; return; }
  if [ -n "${GITHUB_TOKEN:-}" ]; then url="${url/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"; fi
  git clone --depth 1 ${ref:+--branch "$ref"} "$url" "$dir"
}
clone https://github.com/yuvarajeshsp-cloud/rajesh-hub.git ../rajesh-hub "${HUB_REF:-}"

npm ci || npm install
npm test
npm run build
# Honey Packers admin at /admin/ (same Supabase project as the shop).
bash scripts/build-admin.sh
