#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SRC_ROOT="$(cd "$ROOT/../Codex-Dream-Skin" && pwd -P)"
DEST="$ROOT/src-tauri/resources/engine"
mkdir -p "$DEST/macos" "$DEST/windows"

TMP_HELPERS="$(mktemp -d)"
if [ -d "$DEST/windows/scripts" ]; then
  cp -f "$DEST/windows/scripts"/app-*.ps1 "$TMP_HELPERS/" 2>/dev/null || true
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
rm -rf "$TMP_HELPERS"

echo "1.2.3-app" > "$DEST/VERSION"
echo "1.2.3-app" > "$DEST/macos/APP_ENGINE_VERSION"
echo "1.2.3-app" > "$DEST/windows/APP_ENGINE_VERSION"
echo "Synced engine resources to $DEST"
du -sh "$DEST" "$DEST/macos" "$DEST/windows"
