#!/bin/bash

# Dynamically load one pure image as the active theme.
# Hot-applies when CDP is already open (fast).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

IMAGE=""
THEME_NAME=""
FROM_LIBRARY=""
APPLY_NOW="true"
APPEARANCE="auto"
SAFE_AREA="auto"
TASK_MODE="auto"
HOME_LAYOUT="auto"
SURFACE_STYLE="balanced"
CARD_SIZE="balanced"
FOCUS_X=""
FOCUS_Y=""
HERO_TITLE=""
HERO_SUBTITLE=""
PROJECT_LABEL=""
STATUS_TEXT=""
ACCENT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) IMAGE="${2:-}"; shift 2 ;;
    --from-library) FROM_LIBRARY="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --appearance) APPEARANCE="${2:-}"; shift 2 ;;
    --safe-area) SAFE_AREA="${2:-}"; shift 2 ;;
    --task-mode) TASK_MODE="${2:-}"; shift 2 ;;
    --home-layout) HOME_LAYOUT="${2:-}"; shift 2 ;;
    --surface-style) SURFACE_STYLE="${2:-}"; shift 2 ;;
    --card-size) CARD_SIZE="${2:-}"; shift 2 ;;
    --focus-x) FOCUS_X="${2:-}"; shift 2 ;;
    --focus-y) FOCUS_Y="${2:-}"; shift 2 ;;
    --hero-title) HERO_TITLE="${2:-}"; shift 2 ;;
    --hero-subtitle) HERO_SUBTITLE="${2:-}"; shift 2 ;;
    --project-label) PROJECT_LABEL="${2:-}"; shift 2 ;;
    --status-text) STATUS_TEXT="${2:-}"; shift 2 ;;
    --accent) ACCENT="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

case "$APPEARANCE" in auto|light|dark) ;; *) fail "Invalid appearance: $APPEARANCE" ;; esac
case "$SAFE_AREA" in auto|left|right|center|none) ;; *) fail "Invalid safe area: $SAFE_AREA" ;; esac
case "$TASK_MODE" in auto|ambient|banner|off) ;; *) fail "Invalid task mode: $TASK_MODE" ;; esac
case "$HOME_LAYOUT" in auto|framed|immersive) ;; *) fail "Invalid home layout: $HOME_LAYOUT" ;; esac
case "$SURFACE_STYLE" in glass|balanced|solid) ;; *) fail "Invalid surface style: $SURFACE_STYLE" ;; esac
case "$CARD_SIZE" in compact|balanced|showcase) ;; *) fail "Invalid card size: $CARD_SIZE" ;; esac

ensure_state_root
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy 2>/dev/null || true
export NO_PROXY="127.0.0.1,localhost,::1"
export no_proxy="127.0.0.1,localhost,::1"
IMAGES_DIR="$STATE_ROOT/images"
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$IMAGES_DIR" "$THEMES_ROOT" "$THEME_DIR"

if [ -n "$FROM_LIBRARY" ]; then
  [ "$(/usr/bin/basename "$FROM_LIBRARY")" = "$FROM_LIBRARY" ] \
    || fail "Library image must be a filename, not a path."
  case "$FROM_LIBRARY" in
    *$'\n'*|*$'\r'*|*'|'*|*'"'*|*'\'*) fail "Unsafe library image filename." ;;
  esac
  IMAGE="$IMAGES_DIR/$FROM_LIBRARY"
fi

[ -n "$IMAGE" ] || fail "Pass --file <image> or --from-library <name-in-images-dir>"
[ -f "$IMAGE" ] || fail "Image not found: $IMAGE"

case "$IMAGE" in
  *.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.JPEG|*.webp|*.WEBP|*.heic|*.HEIC|*.tif|*.tiff|*.TIF|*.TIFF) ;;
  *) fail "Unsupported image type: $IMAGE" ;;
esac

SOURCE_BYTES="$(/usr/bin/stat -f '%z' "$IMAGE")"
[ "$SOURCE_BYTES" -le 52428800 ] || fail "Image larger than 50 MB."

if [ -z "$THEME_NAME" ]; then
  base="$(/usr/bin/basename "$IMAGE")"
  THEME_NAME="${base%.*}"
fi
[ -n "$THEME_NAME" ] || THEME_NAME="我的主题"

theme_id="img-$(/bin/date '+%Y%m%d%H%M%S')-$$"

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Loading image..."

# Fast Node for write-theme (avoid full codesign when possible)
ensure_node_runtime

# Library-only import must NOT rewrite the active theme dir; left-card preview
# reads THEME_DIR, which should only change when the skin is actually applied.
if [ "$APPLY_NOW" = "true" ]; then
  work_dir="$THEME_DIR"
else
  work_dir="$THEMES_ROOT/$theme_id"
fi
/bin/mkdir -p "$work_dir" "$IMAGES_DIR" "$THEMES_ROOT"

image_name="background.jpg"
temporary="$work_dir/.background.$$.tmp.jpg"
prepared="$work_dir/$image_name"
cleanup_temporary() { /bin/rm -f "$temporary"; }
trap cleanup_temporary EXIT

# Prefer copying already-JPEG; sips only when needed (large PNG conversion is the slow part)
ext="$(printf '%s' "$IMAGE" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$ext" in
  *.jpg|*.jpeg)
    /bin/cp -f "$IMAGE" "$temporary"
    ;;
  *)
    /usr/bin/sips -s format jpeg -s formatOptions 82 -Z 2400 "$IMAGE" --out "$temporary" >/dev/null \
      || fail "Could not convert image. Use PNG/JPEG/HEIC/TIFF/WebP."
    [ -s "$temporary" ] || fail "Converted image is empty."
    ;;
esac
[ -s "$temporary" ] || fail "Prepared image is empty."
PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$temporary")"
[ "$PREPARED_BYTES" -le 16777216 ] || fail "Prepared image larger than 16 MB."
/bin/chmod 600 "$temporary"
/bin/mv -f "$temporary" "$prepared"

theme_args=(
  custom
  --output-dir "$work_dir"
  --image "$image_name"
  --name "$THEME_NAME"
  --tagline "${HERO_SUBTITLE:-Make something wonderful.}"
  --quote "MAKE SOMETHING WONDERFUL"
  --appearance "$APPEARANCE"
  --safe-area "$SAFE_AREA"
  --task-mode "$TASK_MODE"
  --home-layout "$HOME_LAYOUT"
  --surface-style "$SURFACE_STYLE"
  --card-size "$CARD_SIZE"
)
[ -n "$HERO_TITLE" ] && theme_args+=(--hero-title "$HERO_TITLE")
[ -n "$HERO_SUBTITLE" ] && theme_args+=(--hero-subtitle "$HERO_SUBTITLE")
[ -n "$PROJECT_LABEL" ] && theme_args+=(--project-label "$PROJECT_LABEL")
[ -n "$STATUS_TEXT" ] && theme_args+=(--status-text "$STATUS_TEXT")
[ -n "$ACCENT" ] && theme_args+=(--accent "$ACCENT")
[ -n "$FOCUS_X" ] && theme_args+=(--focus-x "$FOCUS_X")
[ -n "$FOCUS_Y" ] && theme_args+=(--focus-y "$FOCUS_Y")
"$NODE" "$SCRIPT_DIR/write-theme.mjs" "${theme_args[@]}" >/dev/null
/usr/bin/find "$work_dir" -maxdepth 1 -type f -name 'background.*' ! -name "$image_name" -delete
trap - EXIT

stamp_theme_id() {
  local file="$1"
  local id="$2"
  "$NODE" -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const id = process.argv[2];
    try {
      const theme = JSON.parse(fs.readFileSync(file, "utf8"));
      theme.id = id;
      fs.writeFileSync(file, JSON.stringify(theme, null, 2) + "\n");
    } catch {}
  ' "$file" "$id" 2>/dev/null || true
}

if [ "$APPLY_NOW" != "true" ]; then
  stamp_theme_id "$work_dir/theme.json" "$theme_id"
  /bin/chmod 600 "$work_dir/"* 2>/dev/null || true
else
  # When applying, also keep a library copy under themes/img-*.
  lib_dir="$THEMES_ROOT/$theme_id"
  /bin/mkdir -p "$lib_dir"
  /bin/cp -f "$work_dir/$image_name" "$work_dir/theme.json" "$lib_dir/"
  /bin/chmod 600 "$lib_dir/"* 2>/dev/null || true
  stamp_theme_id "$lib_dir/theme.json" "$theme_id"
fi

dest_lib_img="$IMAGES_DIR/$(/usr/bin/basename "$IMAGE")"
src_dir="$(cd "$(dirname "$IMAGE")" && pwd -P)"
img_dir="$(cd "$IMAGES_DIR" && pwd -P)"
if [ "$src_dir/$(/usr/bin/basename "$IMAGE")" != "$img_dir/$(/usr/bin/basename "$IMAGE")" ]; then
  /bin/cp -f "$IMAGE" "$dest_lib_img" 2>/dev/null || true
fi

if [ "$APPLY_NOW" != "true" ]; then
  printf 'THEME_ID=%s\n' "$theme_id"
  progress "已就绪：${THEME_NAME}（尚未应用）"
  exit 0
fi

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi

progress "Hot reapply..."
if hot_reapply_theme "$PORT" 8000; then
  progress "完成：${THEME_NAME}"
  exit 0
fi

progress "调试端口未就绪，正在完整启用皮肤…"
if "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --prompt-restart; then
  progress "完成：${THEME_NAME}"
  exit 0
fi

alert_user "图片已保存，但皮肤注入失败。请再点一次「应用皮肤」，并在弹窗中选择「重启并应用」以开启调试端口。"
exit 1
