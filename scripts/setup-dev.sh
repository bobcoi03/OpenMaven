#!/usr/bin/env bash
# setup-dev.sh — one-time dev environment setup
#
# Fixes a Turbopack (Next.js 16) bug where CSS @import resolution starts
# from apps/ instead of apps/web/, causing tailwindcss/tw-animate-css/shadcn
# to be unfindable. Symlinks the affected packages into apps/node_modules/.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_NM="$ROOT/apps/node_modules"

echo "→ Creating apps/node_modules symlinks for Turbopack CSS resolution..."
mkdir -p "$APPS_NM"

for pkg in tailwindcss tw-animate-css shadcn; do
  if [ ! -e "$APPS_NM/$pkg" ]; then
    ln -sf "../web/node_modules/$pkg" "$APPS_NM/$pkg"
    echo "  ✓ $pkg"
  else
    echo "  · $pkg (already exists)"
  fi
done

echo "→ Done. You can now run: cd apps/web && npm run dev"
