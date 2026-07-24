#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC="$ROOT/src-tauri/resources/engine/macos"
DST="${HOME}/.codex/codex-dream-skin-studio"
STATE="${HOME}/Library/Application Support/CodexDreamSkinStudio"

echo "Pushing engine fix -> $DST"
mkdir -p "$DST/scripts" "$DST/assets"

cp -f "$SRC/scripts/injector.mjs" "$DST/scripts/injector.mjs"
cp -f "$SRC/scripts/common-macos.sh" "$DST/scripts/common-macos.sh"
cp -f "$SRC/scripts/start-dream-skin-macos.sh" "$DST/scripts/start-dream-skin-macos.sh"
cp -f "$SRC/scripts/switch-theme-macos.sh" "$DST/scripts/switch-theme-macos.sh"
cp -f "$SRC/scripts/load-image-theme-macos.sh" "$DST/scripts/load-image-theme-macos.sh"
cp -f "$SRC/assets/dream-skin.css" "$DST/assets/dream-skin.css"
cp -f "$SRC/assets/renderer-inject.js" "$DST/assets/renderer-inject.js"
cp -f "$SRC/APP_ENGINE_VERSION" "$DST/APP_ENGINE_VERSION"
cp -f "$SRC/APP_ENGINE_VERSION" "$DST/VERSION"
chmod +x "$DST/scripts/"*.sh

echo "APP_ENGINE_VERSION=$(cat "$DST/APP_ENGINE_VERSION")"
echo
echo "Markers:"
rg -n "suggestionLabelsSoft|Never let shell/system proxy|treating as already stopped|repeat\(4" \
  "$DST/scripts/injector.mjs" "$DST/scripts/common-macos.sh" "$DST/assets/dream-skin.css" | head -20 || true
echo
echo "Done. Next in Dream Skin panel:"
echo "1) Click 应用皮肤"
echo "2) If prompted, choose 重启并应用"
echo "3) Do NOT only click a theme card while CDP is down"
