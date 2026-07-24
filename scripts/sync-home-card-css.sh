#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC="$ROOT/src-tauri/resources/engine/macos/assets"
DST="${HOME}/.codex/codex-dream-skin-studio/assets"
STATE="${HOME}/Library/Application Support/CodexDreamSkinStudio"

# Sync only — never restarts ChatGPT/Codex.
cp -f "$SRC/dream-skin.css" "$DST/dream-skin.css"
cp -f "$SRC/renderer-inject.js" "$DST/renderer-inject.js"
printf '1.2.9-app\n' > "${HOME}/.codex/codex-dream-skin-studio/VERSION"

THEME="$(python3 -c "import json;print(json.load(open('$STATE/state.json')).get('appliedThemeId') or '')" 2>/dev/null || true)"
if curl -fsS -m 2 "http://127.0.0.1:9341/json/version" >/dev/null 2>&1 && [ -n "$THEME" ]; then
  echo "CDP live, hot-applying theme: $THEME"
  bash "${HOME}/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh" --id "$THEME"
else
  echo "Assets synced. CDP not live or no theme id — open Dream Skin and click 应用当前主题 to load new CSS."
  echo "This script does NOT restart ChatGPT."
fi
