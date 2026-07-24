#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC_ROOT="$(cd "$ROOT/../Codex-Dream-Skin" && pwd -P)"
DEST="$ROOT/src-tauri/resources/engine"
mkdir -p "$DEST/macos" "$DEST/windows"

TMP_HELPERS="$(mktemp -d)"
if [ -d "$DEST/windows/scripts" ]; then
  cp -f "$DEST/windows/scripts"/app-*.ps1 "$TMP_HELPERS/" 2>/dev/null || true
  cp -f "$DEST/windows/scripts/status-dream-skin.ps1" "$TMP_HELPERS/" 2>/dev/null || true
fi

rsync -a --delete \
  --exclude '.DS_Store' --exclude 'tests' --exclude 'references' \
  --exclude 'client-delivery' --exclude 'menubar' --exclude 'agents' \
  --exclude 'release' --exclude 'runtime' --exclude '*.command' \
  --exclude 'README.md' --exclude 'CHANGELOG.md' \
  --exclude 'CLIENT_DEPLOY_PROMPT.md' --exclude 'SKILL.md' \
  "$SRC_ROOT/macos/" "$DEST/macos/"

rsync -a --delete \
  --exclude '.DS_Store' --exclude 'tests' --exclude 'references' \
  --exclude 'agents' --exclude 'README.md' --exclude 'README.en.md' \
  --exclude 'CHANGELOG.md' --exclude 'SKILL.md' \
  "$SRC_ROOT/windows/" "$DEST/windows/"

mkdir -p "$DEST/windows/scripts"
if ls "$TMP_HELPERS"/app-*.ps1 >/dev/null 2>&1; then
  cp -f "$TMP_HELPERS"/app-*.ps1 "$DEST/windows/scripts/"
fi
if [ -f "$TMP_HELPERS/status-dream-skin.ps1" ]; then
  cp -f "$TMP_HELPERS/status-dream-skin.ps1" "$DEST/windows/scripts/"
fi
rm -rf "$TMP_HELPERS"

echo "1.2.12-app" > "$DEST/VERSION"
echo "1.2.12-app" > "$DEST/macos/APP_ENGINE_VERSION"
echo "1.2.12-app" > "$DEST/windows/APP_ENGINE_VERSION"
echo "Synced engine resources to $DEST"
du -sh "$DEST" "$DEST/macos" "$DEST/windows"

# Keep platform CSS home-suggestion shared block in sync.
SHARED_CSS="src-tauri/resources/engine/shared/home-suggestions.css"
if [[ -f "$SHARED_CSS" ]]; then
  node -e '
const fs=require("fs");
const shared=fs.readFileSync(process.argv[1],"utf8").trim()+"\n";
const begin="/* BEGIN shared:home-suggestions */";
const end="/* END shared:home-suggestions */";
const block=`${begin}\n${shared}${end}\n`;
for (const file of process.argv.slice(2)) {
  let text=fs.readFileSync(file,"utf8");
  if (text.includes(begin) && text.includes(end)) {
    const re=new RegExp(begin.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"[\\s\\S]*?"+end.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\n?");
    text=text.replace(re, block);
  } else {
    text = text.includes("@media (prefers-reduced-motion: reduce)")
      ? text.replace("@media (prefers-reduced-motion: reduce)", block+"\n@media (prefers-reduced-motion: reduce)")
      : text.trimEnd()+"\n\n"+block;
  }
  fs.writeFileSync(file, text);
  console.log("synced", file);
}
' "$SHARED_CSS"     "src-tauri/resources/engine/macos/assets/dream-skin.css"     "src-tauri/resources/engine/windows/assets/dream-skin.css"
fi


# Keep markHomeSuggestions helper inlined into platform injectors.
SHARED_JS="src-tauri/resources/engine/shared/mark-home-suggestions.js"
if [[ -f "$SHARED_JS" ]]; then
  node -e '
const fs = require("fs");
const shared = fs.readFileSync(process.argv[1], "utf8")
  .replace(/^\/\/.*\n/, "")
  .trim() + "\n";
const begin = "/* BEGIN shared:mark-home-suggestions */";
const end = "/* END shared:mark-home-suggestions */";
const block = `${begin}\n${shared}${end}`;
for (const file of process.argv.slice(2)) {
  let text = fs.readFileSync(file, "utf8");
  if (text.includes(begin) && text.includes(end)) {
    const re = new RegExp(begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    text = text.replace(re, block);
  } else if (text.includes("const STATE_KEY = \"__CODEX_DREAM_SKIN_STATE__\";")) {
    text = text.replace(
      "const STATE_KEY = \"__CODEX_DREAM_SKIN_STATE__\";",
      "const STATE_KEY = \"__CODEX_DREAM_SKIN_STATE__\";\n\n  " + block.replace(/\n/g, "\n  ") + "\n",
    );
  }
  fs.writeFileSync(file, text);
  console.log("synced inject helper", file);
}
' "$SHARED_JS" \
    "src-tauri/resources/engine/macos/assets/renderer-inject.js" \
    "src-tauri/resources/engine/windows/assets/renderer-inject.js"
fi
