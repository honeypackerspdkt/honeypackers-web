#!/usr/bin/env bash
# Netlify build: this site links two sibling repos with file: dependencies
#   ../rajesh-hub  (@rajesh-hub/tokens, @rajesh-hub/web-growth)
#   ../BoxBook     (@honeypackers/box-core: box maths + web pricing)
# Netlify only checks out this repo, so clone them next to it first.
# For private repos set GITHUB_TOKEN (read-only, fine-grained) in Netlify's environment variables.
# BOXBOOK_REF / HUB_REF pick a branch (default: the repo's default branch).
set -euo pipefail
cd "$(dirname "$0")/.."

clone() { # url dir ref
  local url="$1" dir="$2" ref="${3:-}"
  [ -d "$dir/.git" ] && { echo "using existing $dir"; return; }
  if [ -n "${GITHUB_TOKEN:-}" ]; then url="${url/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"; fi
  git clone --depth 1 ${ref:+--branch "$ref"} "$url" "$dir"
}
clone https://github.com/yuvarajeshsp-cloud/rajesh-hub.git ../rajesh-hub "${HUB_REF:-}"
clone https://github.com/honeypackerspdkt/BoxBook.git ../BoxBook "${BOXBOOK_REF:-}"

npm ci || npm install
npm test
npm run build
