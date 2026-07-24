#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC="$ROOT/src-tauri/resources/engine/macos"
DST="${HOME}/.codex/codex-dream-skin-studio"
STATE="${HOME}/Library/Application Support/CodexDreamSkinStudio"
cp -f "$SRC/assets/dream-skin.css" "$DST/assets/dream-skin.css"
cp -f "$SRC/assets/renderer-inject.js" "$DST/assets/renderer-inject.js"
cp -f "$SRC/APP_ENGINE_VERSION" "$DST/APP_ENGINE_VERSION" 2>/dev/null || true
echo "Restored safe home CSS/JS (v1.2.9 geometry + 4-col cards only)."
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy 2>/dev/null || true
export NO_PROXY="127.0.0.1,localhost,::1"
THEME="$(python3 -c "import json;print(json.load(open('$STATE/state.json')).get('appliedThemeId') or '')" 2>/dev/null || true)"
if curl --noproxy '*' -fsS -m 2 "http://127.0.0.1:9341/json/version" >/dev/null 2>&1 && [ -n "$THEME" ]; then
  bash "$DST/scripts/switch-theme-macos.sh" --id "$THEME" || true
else
  echo "Re-apply current theme in Dream Skin once."
fi
