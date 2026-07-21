#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC="$ROOT/src-tauri/resources/engine/macos/presets"
STATE_THEMES="${HOME}/Library/Application Support/CodexDreamSkinStudio/themes"
ENGINE_HOME="${HOME}/.codex/codex-dream-skin-studio"

mkdir -p "$STATE_THEMES"
for slug in preset-arina-hashimoto preset-gothic-void-crusade preset-little-cat preset-red-fortune; do
  if [ ! -d "$SRC/$slug" ]; then
    echo "missing bundled preset: $slug" >&2
    continue
  fi
  dest="$STATE_THEMES/$slug"
  mkdir -p "$dest"
  /bin/cp -f "$SRC/$slug/"* "$dest/"
  /bin/chmod 600 "$dest"/* 2>/dev/null || true
  echo "seeded $slug"
done

# remove converted customs if still present
/bin/rm -rf \
  "$STATE_THEMES/img-20260721105603-62042" \
  "$STATE_THEMES/img-20260721111435-84797"

if [ -d "$ENGINE_HOME/presets" ]; then
  for slug in preset-little-cat preset-red-fortune; do
    mkdir -p "$ENGINE_HOME/presets/$slug"
    /bin/cp -f "$SRC/$slug/"* "$ENGINE_HOME/presets/$slug/"
  done
  echo "updated engine presets at $ENGINE_HOME/presets"
fi

echo "Done. Refresh Dream Skin App theme library."
ls -1 "$STATE_THEMES"
