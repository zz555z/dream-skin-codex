#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
PORT_EXPLICIT="false"
RESTORE_BASE_THEME="false"
RESTART_CODEX="false"
UNINSTALL="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restore-base-theme) RESTORE_BASE_THEME="true"; shift ;;
    --restart-codex) RESTART_CODEX="true"; shift ;;
    --uninstall) UNINSTALL="true"; shift ;;
    *) fail "Unknown restore argument: $1" ;;
  esac
done

discover_codex_app
# Restore must not hard-fail when ChatGPT's signature is already broken.
require_macos_control_runtime
ensure_state_root
if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port 2>/dev/null || true)"
  case "${PORT:-}" in
    ''|*[!0-9]*) PORT=9341 ;;
  esac
fi

if [ -f "$STATE_PATH" ]; then
  if ! stop_recorded_injector; then
    printf 'ChatGPT Dream Skin: could not fully stop the recorded injector; continuing restore.\n' >&2
    # Best-effort: clear the known launchd babysitter and any injector process
    # whose command line clearly belongs to this install.
    /bin/launchctl remove "$INJECTOR_JOB_LABEL" >/dev/null 2>&1 || true
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      /bin/kill -TERM "$pid" 2>/dev/null || true
    done < <(/bin/ps -axo pid=,command= | /usr/bin/awk -v inj="$INJECTOR" '
      index($0, inj) { print $1 }
    ')
  fi
fi
# Always remove the themed ChatGPT launchd job so quitting ChatGPT stays quit.
release_codex_launchd_job || true
CODEX_RUNNING="false"
codex_is_running && CODEX_RUNNING="true"
DEBUG_READY="false"
verified_cdp_endpoint "$PORT" && DEBUG_READY="true"

if [ "$DEBUG_READY" = "true" ]; then
  if ! "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null; then
    if [ "$RESTART_CODEX" = "true" ]; then
      printf 'ChatGPT Dream Skin: live skin removal could not be verified; restarting ChatGPT for a full restore.\n' >&2
    else
      fail "The live skin could not be removed and verified; restore stopped safely."
    fi
  fi
elif [ "$CODEX_RUNNING" = "true" ] && [ "$RESTART_CODEX" = "false" ]; then
  fail "ChatGPT is still running but its saved CDP endpoint cannot be verified. Pass --restart-codex for a full restore."
fi

if [ "$RESTORE_BASE_THEME" = "true" ]; then
  if [ "$CODEX_RUNNING" = "true" ]; then
    [ "$RESTART_CODEX" = "true" ] \
      || fail "Close ChatGPT or pass --restart-codex before restoring config.toml."
    stop_codex true
    CODEX_RUNNING="false"
  fi
  if [ -f "$THEME_BACKUP_PATH" ]; then
    if ! "$NODE" "$SCRIPT_DIR/theme-config.mjs" restore "$CONFIG_PATH" "$THEME_BACKUP_PATH"; then
      printf 'ChatGPT Dream Skin: base theme backup restore failed; skin session cleanup will still continue.\n' >&2
    fi
  else
    printf 'ChatGPT Dream Skin: no theme-backup.json found; skipped config.toml base-theme restore.\n' >&2
  fi
fi

if [ "$RESTART_CODEX" = "true" ]; then
  [ "$CODEX_RUNNING" = "true" ] && stop_codex true
  launch_codex_normally
fi

/bin/rm -f "$STATE_PATH"
clear_operation_state
/bin/rm -f "$OPERATION_ACK_PATH"
if [ "$UNINSTALL" = "true" ]; then
  /bin/rm -f "$HOME/Desktop/Codex Dream Skin.command"
  /bin/rm -f "$HOME/Desktop/Codex Dream Skin - Customize.command"
  /bin/rm -f "$HOME/Desktop/Codex Dream Skin - Verify.command"
  /bin/rm -f "$HOME/Desktop/Codex Dream Skin - Restore.command"
fi

printf 'ChatGPT Dream Skin was removed and the requested macOS restore actions completed successfully.\n'
