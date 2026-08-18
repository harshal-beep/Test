#!/usr/bin/env bash
#
# Build the developer handoff bundle.
#
#   ./scripts/package.sh [output.zip]
#
# Ships exactly what git tracks, so node_modules, .next and .env.local can
# never leak in. Run from the pucho-pulse directory with a clean working tree.
set -euo pipefail

OUT="${1:-../pucho-pulse-source.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$(dirname "$0")/.."
REPO_ROOT="$(git rev-parse --show-toplevel)"
PREFIX="$(git rev-parse --show-prefix)"      # e.g. "pucho-pulse/"

if [ -n "$(git status --porcelain -- .)" ]; then
  echo "warning: uncommitted changes in pucho-pulse/ will NOT be included" >&2
fi

git -C "$REPO_ROOT" archive "HEAD:${PREFIX%/}" | tar -x -C "$STAGE"

# Sanity: nothing secret, nothing generated.
if find "$STAGE" \( -name '.env.local' -o -name '*.pem' -o -name '*.key' \) | grep -q .; then
  echo "refusing to package: secret-looking files present" >&2
  exit 1
fi

OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
rm -f "$OUT_ABS"
(cd "$STAGE" && zip -qr "$OUT_ABS" . -x '*.DS_Store')

echo "$OUT_ABS"
echo "  $(unzip -l "$OUT_ABS" | tail -1 | awk '{print $2}') files, $(du -h "$OUT_ABS" | cut -f1)"
