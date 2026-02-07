#!/usr/bin/env bash
set -euo pipefail

# ─── VCV Portfolio Build Script ───
# Builds the project for production deployment.
# Output goes to ./dist/

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "━━━ VCV Build ━━━"
echo ""

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "✗ Node.js not found. Install it from https://nodejs.org"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# 2. Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "→ Installing dependencies..."
  npm ci
else
  echo "✓ Dependencies installed"
fi

# 3. Type-check
echo "→ Running TypeScript type-check..."
npx tsc -b --noEmit 2>/dev/null || npx tsc -b
echo "✓ Type-check passed"

# 4. Build for production
echo "→ Building for production..."
npx vite build
echo "✓ Build complete"

# 5. Report output
echo ""
echo "━━━ Build Output ━━━"
du -sh dist/
echo ""
echo "To preview locally:  npm run preview"
echo "To deploy:           upload the ./dist/ folder"
