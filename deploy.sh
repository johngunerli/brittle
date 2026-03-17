#!/usr/bin/env bash
# deploy.sh — Build and deploy brittle to Cloudflare Pages
# Usage: ./deploy.sh [project-name]
#
# First-time setup:
#   1. wrangler login
#   2. Set secrets (see below)
#   3. ./deploy.sh
#
# Secrets must be set in Cloudflare before deploying:
#   wrangler pages secret put AUTH_GITHUB_ID    --project-name=<project>
#   wrangler pages secret put AUTH_GITHUB_SECRET --project-name=<project>
#   wrangler pages secret put AUTH_SECRET        --project-name=<project>
#   wrangler pages secret put GITHUB_USERNAME    --project-name=<project>
#   wrangler pages secret put GITHUB_PAT         --project-name=<project>
#   wrangler pages secret put GITHUB_OWNER       --project-name=<project>
#   wrangler pages secret put GITHUB_REPO        --project-name=<project>

set -euo pipefail

PROJECT="${1:-brittle}"

# ─── Sync secrets from .env.local ─────────────────────────────────────────────
if [ -f .env.local ]; then
  echo "→ Pushing secrets from .env.local to Cloudflare Pages..."
  SECRETS=(AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_SECRET GITHUB_USERNAME GITHUB_PAT GITHUB_OWNER GITHUB_REPO)
  for KEY in "${SECRETS[@]}"; do
    VALUE=$(grep -E "^${KEY}=" .env.local | cut -d= -f2-)
    if [ -n "$VALUE" ]; then
      echo "$VALUE" | npx wrangler pages secret put "$KEY" --project-name="$PROJECT"
    else
      echo "  ⚠ Skipping $KEY (not set in .env.local)"
    fi
  done
fi

echo "→ Building for Cloudflare Pages..."
npx @cloudflare/next-on-pages

echo "→ Deploying to Cloudflare Pages (project: $PROJECT)..."
npx wrangler pages deploy .vercel/output/static --project-name="$PROJECT"

echo "✓ Deployed."
