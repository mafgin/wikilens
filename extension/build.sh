#!/usr/bin/env bash
# Assemble dist-chrome/ and dist-firefox/ from src/ by copying everything and
# swapping in the per-browser manifest. No bundler — plain file copy.
set -euo pipefail
cd "$(dirname "$0")"

SRC=src
for browser in chrome firefox; do
  OUT="dist-$browser"
  rm -rf "$OUT"
  mkdir -p "$OUT"
  rsync -a --exclude 'manifest.*.json' "$SRC"/ "$OUT"/
  cp "$SRC/manifest.$browser.json" "$OUT/manifest.json"
  echo "built $OUT"
done
