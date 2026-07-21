#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC="$ROOT/src-tauri/resources/engine/macos/presets"
STATE_THEMES="${HOME}/Library/Application Support/CodexDreamSkinStudio/themes"
ENGINE_HOME="${HOME}/.codex/codex-dream-skin-studio"

mkdir -p "$STATE_THEMES"
for slug in preset-arina-hashimoto preset-gothic-void-crusade preset-little-cat preset-hebei-caihua; do
  if [ ! -d "$SRC/$slug" ]; then
    echo "missing bundled preset: $slug" >&2
    continue
  fi
  dest="$STATE_THEMES/$slug"
  /bin/rm -rf "$dest"
  /bin/mkdir -p "$dest"
  /bin/cp -f "$SRC/$slug/"* "$dest/"
  /bin/chmod 600 "$dest"/* 2>/dev/null || true
  echo "seeded $slug"
done

# drop retired packs + custom 桥本有菜 duplicates
/bin/rm -rf \
  "$STATE_THEMES/preset-red-fortune" \
  "$STATE_THEMES/img-20260721105603-62042" \
  "$STATE_THEMES/img-20260721111435-84797" \
  "$STATE_THEMES/img-20260721140655-16306" \
  "$STATE_THEMES/img-20260721152915-73626"

# also remove any remaining custom theme named 桥本有菜
python3 - <<'PY2'
import json, shutil
from pathlib import Path
root = Path.home() / "Library/Application Support/CodexDreamSkinStudio/themes"
if root.is_dir():
    for d in list(root.iterdir()):
        if not d.is_dir() or d.name.startswith("preset-"):
            continue
        tj = d / "theme.json"
        if not tj.exists():
            continue
        try:
            name = str(json.loads(tj.read_text(encoding="utf-8")).get("name") or "")
        except Exception:
            continue
        if "桥本" in name or "hashimoto" in name.lower() or "arina" in name.lower():
            shutil.rmtree(d)
            print(f"removed custom duplicate: {d.name} ({name})")
PY2

if [ -d "$ENGINE_HOME/presets" ]; then
  /bin/rm -rf "$ENGINE_HOME/presets/preset-red-fortune"
  for slug in preset-arina-hashimoto preset-gothic-void-crusade preset-little-cat preset-hebei-caihua; do
    [ -d "$SRC/$slug" ] || continue
    /bin/rm -rf "$ENGINE_HOME/presets/$slug"
    /bin/mkdir -p "$ENGINE_HOME/presets/$slug"
    /bin/cp -f "$SRC/$slug/"* "$ENGINE_HOME/presets/$slug/"
  done
  echo "updated engine presets at $ENGINE_HOME/presets"
fi

echo "Done. Refresh Dream Skin App theme library."
echo "Current themes:"
/bin/ls -1 "$STATE_THEMES"
