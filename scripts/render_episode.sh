#!/usr/bin/env bash
set -euo pipefail

EP_DIR="${1:-}"
QUALITY="${2:-looks}"
if [[ -z "$EP_DIR" ]]; then
  echo "Usage: bash scripts/render_episode.sh episodes/<episode_folder> [draft|looks|delivery]"
  exit 1
fi

if [[ -z "${HYPERFRAMES_BROWSER_PATH:-}" && -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  export HYPERFRAMES_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

echo "==> Step 1: Compiling episode.json -> 16:9 Long & 9:16 Shorts..."
node engine/compiler/build_episode.mjs "$EP_DIR"

EP_NAME="$(basename "$EP_DIR")"
BUILD_DIR="$EP_DIR/build"
OUT_DIR="$EP_DIR/output"
mkdir -p "$OUT_DIR"

echo "==> Step 2: Rendering 16:9 Long-Form Master ($QUALITY)..."
npx hyperframes render --composition "$BUILD_DIR/long_16x9.html" --output "$OUT_DIR/${EP_NAME}_long_16x9.mp4" --quality "$QUALITY"

for short_html in "$BUILD_DIR"/short_*_9x16.html; do
  [[ -e "$short_html" ]] || continue
  base="$(basename "$short_html" .html)"
  echo "==> Step 3: Rendering 9:16 Short/Reel ($base, $QUALITY)..."
  npx hyperframes render --composition "$short_html" --output "$OUT_DIR/${EP_NAME}_${base}.mp4" --quality "$QUALITY"
done

echo "==> Done! Output files in $OUT_DIR:"
ls -lh "$OUT_DIR"
