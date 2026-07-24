import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { localizeErrorMessage } from "../lib/localizeError";
import { mapPool } from "../lib/previewPool";
import { withTimeout } from "../lib/withTimeout";
import type { StatusSnapshot, ThemeSummary } from "../types";

const STATUS_TIMEOUT_MS = 8000;
const THEMES_TIMEOUT_MS = 12000;
const PREVIEW_TIMEOUT_MS = 6000;
const PREVIEW_CONCURRENCY = 3;
const ACTIVE_POLL_MS = 12000;
const BACKGROUND_POLL_MS = 30000;
const IS_BROWSER_PREVIEW = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window);

export const BROWSER_PREVIEW_STATUS: StatusSnapshot = {
  installed: true,
  canInstall: false,
  platform: "browser-preview",
  engineRoot: "",
  stateRoot: "",
  bundledEngineRoot: "",
  engineVersion: "preview",
  session: "active",
  port: 9341,
  codexRunning: true,
  injectorAlive: true,
  appliedThemeName: "界面预览",
  appliedThemeId: "",
  activeImageDataUrl: null,
  busy: false,
  installHint: "",
};

export function useEngineStatus(options: {
  busy: boolean;
  showToast: (message: string, kind?: "ok" | "err") => void;
}) {
  const { busy, showToast } = options;
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const busyRef = useRef(busy);
  const documentVisibleRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );
  const windowFocusedRef = useRef(true);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const inflightPreviews = useRef(new Set<string>());

  const loadThemePreview = useCallback(async (themeId: string) => {
    if (IS_BROWSER_PREVIEW || !themeId) return;
    if (inflightPreviews.current.has(themeId)) return;
    inflightPreviews.current.add(themeId);
    try {
      // Skip if already present.
      let already = false;
      setThemes((current) => {
        already = Boolean(current.find((item) => item.id === themeId)?.previewDataUrl);
        return current;
      });
      if (already) return;
      const previewDataUrl = await withTimeout(
        api.previewTheme(themeId),
        PREVIEW_TIMEOUT_MS,
      );
      setThemes((current) =>
        current.map((item) =>
          item.id === themeId && !item.previewDataUrl
            ? { ...item, previewDataUrl }
            : item,
        ),
      );
    } catch {
      // Preview is best-effort; keep metadata card usable without image.
    } finally {
      inflightPreviews.current.delete(themeId);
    }
  }, []);

  const loadThemePreviews = useCallback(
    async (items: ThemeSummary[], limit = 4) => {
      if (IS_BROWSER_PREVIEW || !items.length) return;
      const pending = items.filter((theme) => !theme.previewDataUrl).slice(0, limit);
      if (!pending.length) return;
      await mapPool(pending, PREVIEW_CONCURRENCY, async (theme) => {
        await loadThemePreview(theme.id);
        return null;
      });
    },
    [loadThemePreview],
  );

  const refresh = useCallback(
    async (refreshOptions?: { silent?: boolean; forceThemes?: boolean }) => {
      if (IS_BROWSER_PREVIEW) {
        setStatus(BROWSER_PREVIEW_STATUS);
        setThemes([]);
        return;
      }
      const silent = Boolean(refreshOptions?.silent);
      try {
        const nextStatus = await withTimeout(api.getStatus(), STATUS_TIMEOUT_MS);
        setStatus((current) => {
          if (
            current?.activeImageDataUrl &&
            current.appliedThemeId &&
            current.appliedThemeId === nextStatus.appliedThemeId &&
            !nextStatus.activeImageDataUrl
          ) {
            return { ...nextStatus, activeImageDataUrl: current.activeImageDataUrl };
          }
          return nextStatus;
        });
        if (nextStatus.installed) {
          try {
            const nextThemes = await withTimeout(api.getThemes(), THEMES_TIMEOUT_MS);
            setThemes((current) => {
              const previewById = new Map(
                current
                  .filter((theme) => theme.previewDataUrl)
                  .map((theme) => [theme.id, theme.previewDataUrl] as const),
              );
              return nextThemes.map((theme) => ({
                ...theme,
                previewDataUrl: theme.previewDataUrl || previewById.get(theme.id),
              }));
            });
            void loadThemePreviews(nextThemes);
          } catch {
            if (!silent || refreshOptions?.forceThemes) {
              setThemes((current) => current);
            }
          }
        } else {
          setThemes([]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus((current) =>
          current
            ? {
                ...current,
                busy: false,
                installHint:
                  current.installHint ||
                  "状态刷新较慢。界面仍可操作；可稍后点「刷新」重试。",
              }
            : {
                installed: false,
                canInstall: true,
                platform: "windows",
                engineRoot: "",
                stateRoot: "",
                bundledEngineRoot: "",
                engineVersion: "unknown",
                session: "off",
                port: 9335,
                codexRunning: false,
                injectorAlive: false,
                appliedThemeName: "",
                appliedThemeId: "",
                activeImageDataUrl: null,
                busy: false,
                installHint: "状态刷新较慢。界面仍可操作；可稍后点「刷新」重试。",
              },
        );
        if (!silent) {
          showToast(localizeErrorMessage(message, "状态刷新超时"), "err");
        }
      }
    },
    [loadThemePreviews, showToast],
  );

  useEffect(() => {
    if (IS_BROWSER_PREVIEW) return;
    const themeId = status?.appliedThemeId?.trim();
    if (!themeId) return;
    if (status?.activeImageDataUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const previewDataUrl = await withTimeout(
          api.previewTheme(themeId),
          PREVIEW_TIMEOUT_MS,
        );
        if (cancelled) return;
        setStatus((current) => {
          if (!current || current.appliedThemeId !== themeId || current.activeImageDataUrl) {
            return current;
          }
          return { ...current, activeImageDataUrl: previewDataUrl };
        });
      } catch {
        // Keep status card usable without artwork.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.appliedThemeId, status?.activeImageDataUrl]);

  useEffect(() => {
    void refresh({ silent: true, forceThemes: true });
  }, [refresh]);

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const active = documentVisibleRef.current && windowFocusedRef.current;
      const delay = active ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS;
      timer = window.setTimeout(() => {
        if (!busyRef.current && documentVisibleRef.current) {
          void refresh({ silent: true });
        }
        schedule();
      }, delay);
    };

    const onVisibility = () => {
      documentVisibleRef.current = document.visibilityState !== "hidden";
      if (documentVisibleRef.current && !busyRef.current) {
        void refresh({ silent: true });
      }
      schedule();
    };
    const onFocus = () => {
      windowFocusedRef.current = true;
      if (!busyRef.current) void refresh({ silent: true });
      schedule();
    };
    const onBlur = () => {
      windowFocusedRef.current = false;
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [refresh]);

  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      void refresh({ silent: true, forceThemes: true });
    }
    wasBusyRef.current = busy;
  }, [busy, refresh]);

  return {
    status,
    setStatus,
    themes,
    setThemes,
    refresh,
    loadThemePreview,
    isBrowserPreview: IS_BROWSER_PREVIEW,
  };
}
