import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  api,
  fileToBase64,
  MAX_IMAGE_BYTES,
  MAX_WINDOWS_IMAGE_BYTES,
} from "./lib/api";
import type { StatusSnapshot, ThemeSummary } from "./types";
import { localizeErrorMessage } from "./lib/localizeError";
import { BACKGROUND_AI_PROMPT_ZH } from "./lib/backgroundPrompt";
import {
  fileNameFromPath,
  resolveThemeName,
  themeNameFromImage,
} from "./lib/themeName";

type SelectedImage =
  | { source: "file"; file: File; name: string; size: number }
  | { source: "path"; path: string; name: string; size?: number };

const IMAGE_EXT = /\.(png|jpe?g|webp|heic|tif{1,2})$/i;
const WINDOWS_IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const ACTION_TIMEOUT_MS = 45_000;
const DEFAULT_HERO_TITLE = "我们今天来构建什么？";
const DEFAULT_HERO_SUBTITLE = "和你的灵感一起，把想法写成代码。";
const DEFAULT_PROJECT_LABEL = "◉ 选择项目";
const DEFAULT_STATUS_TEXT = "DREAM SKIN ONLINE";
const DEFAULT_ACCENT_COLOR = "#e08a91";
const DEFAULT_FOCUS_X = 68;
const DEFAULT_FOCUS_Y = 44;
/** Recommended advanced defaults — auto home layout + solid cards. */
const DEFAULT_HOME_LAYOUT = "auto";
const DEFAULT_SURFACE_STYLE = "solid";
const DEFAULT_CARD_SIZE = "balanced";
const IS_BROWSER_PREVIEW = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window);
// Status can time out before the first snapshot arrives; guess the platform
// from the UA so a Mac never sees Windows-only install steps.
const FALLBACK_PLATFORM = navigator.userAgent.includes("Windows")
  ? "windows"
  : navigator.userAgent.includes("Mac")
    ? "macos"
    : "unknown";
const BROWSER_PREVIEW_STATUS: StatusSnapshot = {
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
  activeImageFingerprint: "",
  busy: false,
  installHint: "",
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("操作等待超时，后台进程可能仍在收尾，请稍后刷新状态")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

const STATUS_TIMEOUT_MS = 8000;
const THEMES_TIMEOUT_MS = 8000;
const PREVIEW_TIMEOUT_MS = 6000;
const PREVIEW_CONCURRENCY = 4;
const POST_ACTION_REFRESH_ATTEMPTS = 3;


function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name);
}

function Chip({ text, kind = "" }: { text: string; kind?: string }) {
  return <span className={`chip ${kind}`.trim()}>{text}</span>;
}

type ConfirmStep = {
  title: string;
  body: string;
  confirmLabel?: string;
};

type ConfirmDialogState = {
  steps: ConfirmStep[];
  stepIndex: number;
  danger?: boolean;
  onConfirm: () => void;
};

export default function App() {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("处理中…");
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [themeName, setThemeName] = useState("");
  const [appearance, setAppearance] = useState("auto");
  const [safeArea, setSafeArea] = useState("auto");
  const [taskMode, setTaskMode] = useState("auto");
  const [homeLayout, setHomeLayout] = useState(DEFAULT_HOME_LAYOUT);
  const [surfaceStyle, setSurfaceStyle] = useState(DEFAULT_SURFACE_STYLE);
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);
  const [useCustomFocus, setUseCustomFocus] = useState(false);
  const [focusX, setFocusX] = useState(DEFAULT_FOCUS_X);
  const [focusY, setFocusY] = useState(DEFAULT_FOCUS_Y);
  const [heroTitle, setHeroTitle] = useState(DEFAULT_HERO_TITLE);
  const [heroSubtitle, setHeroSubtitle] = useState(DEFAULT_HERO_SUBTITLE);
  const [projectLabel, setProjectLabel] = useState(DEFAULT_PROJECT_LABEL);
  const [statusText, setStatusText] = useState(DEFAULT_STATUS_TEXT);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [useCustomAccent, setUseCustomAccent] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLLabelElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const diagnosticClicksRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const themePreviewCacheRef = useRef(new Map<string, string>());
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const activeImageKeyRef = useRef("");

  useEffect(() => {
    if (!advancedOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      rootOverflow: root?.style.overflow ?? "",
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (root) root.style.overflow = "hidden";

    const scrollableSelector = ".advanced-body";
    const getScrollableAncestor = (target: EventTarget | null) => {
      let node = target instanceof Element ? target : null;
      while (node) {
        if (node.matches(scrollableSelector)) return node as HTMLElement;
        node = node.parentElement;
      }
      return null;
    };

    const canScroll = (element: HTMLElement, deltaY: number) => {
      if (element.scrollHeight <= element.clientHeight + 1) return false;
      if (deltaY < 0) return element.scrollTop > 0;
      if (deltaY > 0) {
        return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      }
      return false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Confirm dialog owns Escape when open.
        if (document.querySelector(".confirm-modal-overlay")) return;
        setAdvancedOpen(false);
      }
    };

    const onWheel = (event: WheelEvent) => {
      const scrollable = getScrollableAncestor(event.target);
      // Only allow native scrolling when the modal body itself can still move.
      if (scrollable && canScroll(scrollable, event.deltaY)) return;
      // No scrollbar, at edge, or pointer is outside the body: lock the page.
      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      const scrollable = getScrollableAncestor(event.target);
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 1) return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    // Capture phase so we stop the background page before it scrolls.
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      if (root) root.style.overflow = previous.rootOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
    };
  }, [advancedOpen]);

  const installed = Boolean(status?.installed);
  const canInstall = Boolean(status?.canInstall);
  const isWindows = status?.platform === "windows";
  const selectedImageLimit = isWindows ? MAX_WINDOWS_IMAGE_BYTES : MAX_IMAGE_BYTES;

  const showToast = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    // Engine errors can span several lines; keep them up long enough to read.
    toastTimerRef.current = window.setTimeout(
      () => {
        setToast(null);
        toastTimerRef.current = null;
      },
      kind === "err" ? 4200 : 1000,
    );
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const openConfirmDialog = useCallback(
    (options: { steps: ConfirmStep[]; danger?: boolean; onConfirm: () => void }) => {
      setConfirmDialog({
        steps: options.steps,
        stepIndex: 0,
        danger: options.danger,
        onConfirm: options.onConfirm,
      });
    },
    [],
  );

  const advanceConfirmDialog = useCallback(() => {
    if (!confirmDialog) return;
    if (confirmDialog.stepIndex < confirmDialog.steps.length - 1) {
      setConfirmDialog({
        ...confirmDialog,
        stepIndex: confirmDialog.stepIndex + 1,
      });
      return;
    }
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    action();
  }, [confirmDialog]);

  useEffect(() => {
    if (!confirmDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setConfirmDialog(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirmDialog]);

  const revealDiagnostics = useCallback(async () => {
    if (status?.platform !== "windows") return;
    diagnosticClicksRef.current += 1;
    if (diagnosticClicksRef.current < 5) return;
    diagnosticClicksRef.current = 0;
    try {
      await api.setDiagnostics(true);
      showToast("诊断日志已开启，重现问题后提供 CodexDreamSkin 文件夹", "ok");
    } catch (error) {
      showToast(localizeErrorMessage(String(error), "无法开启诊断日志"), "err");
    }
  }, [showToast, status?.platform]);

  const copyBackgroundPrompt = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(BACKGROUND_AI_PROMPT_ZH);
      } else {
        const area = document.createElement("textarea");
        area.value = BACKGROUND_AI_PROMPT_ZH;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      showToast("生图提示词已复制", "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(localizeErrorMessage(message, "复制失败"), "err");
    }
  }, [showToast]);

  const loadThemePreviews = useCallback(async (items: ThemeSummary[]) => {
    if (IS_BROWSER_PREVIEW || !items.length) return;
    const pending = items.filter((theme) => !theme.previewDataUrl);
    for (let index = 0; index < pending.length; index += PREVIEW_CONCURRENCY) {
      const batch = pending.slice(index, index + PREVIEW_CONCURRENCY);
      await Promise.all(batch.map(async (theme) => {
        try {
          const previewDataUrl = await withTimeout(
            api.previewTheme(theme.id),
            PREVIEW_TIMEOUT_MS,
          );
          themePreviewCacheRef.current.set(theme.id, previewDataUrl);
          setThemes((current) =>
            current.map((item) =>
              item.id === theme.id && !item.previewDataUrl
                ? { ...item, previewDataUrl }
                : item,
            ),
          );
        } catch {
          // Preview is best-effort; keep metadata card usable without image.
        }
      }));
    }
  }, []);

  /** Fetch the heavy stage image only when its fingerprint changed. */
  const syncActiveImage = useCallback(async (fingerprint: string) => {
    if (fingerprint === activeImageKeyRef.current) return;
    activeImageKeyRef.current = fingerprint;
    if (!fingerprint) {
      setActiveImage(null);
      return;
    }
    try {
      const dataUrl = await withTimeout(api.activeImage(), PREVIEW_TIMEOUT_MS);
      if (activeImageKeyRef.current === fingerprint) setActiveImage(dataUrl);
    } catch {
      // Reset so the next status refresh retries the fetch.
      if (activeImageKeyRef.current === fingerprint) activeImageKeyRef.current = "";
    }
  }, []);

  const refresh = useCallback(async (options?: { silent?: boolean }): Promise<boolean> => {
    if (IS_BROWSER_PREVIEW) {
      setStatus(BROWSER_PREVIEW_STATUS);
      setThemes([]);
      return true;
    }
    try {
      const nextStatus = await withTimeout(api.getStatus(), STATUS_TIMEOUT_MS);
      setStatus(nextStatus);
      void syncActiveImage(nextStatus.activeImageFingerprint || "");
      if (nextStatus.installed) {
        try {
          const nextThemes = await withTimeout(api.getThemes(), THEMES_TIMEOUT_MS);
          const knownIds = new Set(nextThemes.map((theme) => theme.id));
          for (const id of themePreviewCacheRef.current.keys()) {
            if (!knownIds.has(id)) themePreviewCacheRef.current.delete(id);
          }
          const themesWithCachedPreviews = nextThemes.map((theme) => ({
            ...theme,
            previewDataUrl:
              theme.previewDataUrl ?? themePreviewCacheRef.current.get(theme.id) ?? null,
          }));
          setThemes(themesWithCachedPreviews);
          void loadThemePreviews(themesWithCachedPreviews);
        } catch {
          // Transient theme-list failure: keep showing the previous list.
        }
      } else {
        setThemes([]);
      }
      return true;
    } catch (error) {
      if (options?.silent) return false;
      const message = error instanceof Error ? error.message : String(error);
      // Keep UI responsive even when the status script hangs/times out.
      setStatus((current) =>
        current
          ? {
              ...current,
              busy: false,
              installHint:
                current.installHint ||
                "状态刷新超时。界面仍可操作；可稍后点「刷新」重试。",
            }
          : {
              installed: false,
              canInstall: true,
              platform: FALLBACK_PLATFORM,
              engineRoot: "",
              stateRoot: "",
              bundledEngineRoot: "",
              engineVersion: "unknown",
              session: "off",
              port: FALLBACK_PLATFORM === "windows" ? 9335 : 9341,
              codexRunning: false,
              injectorAlive: false,
              appliedThemeName: "",
              appliedThemeId: "",
              activeImageFingerprint: "",
              busy: false,
              installHint: "状态刷新超时。界面仍可操作；可稍后点「刷新」重试。",
            },
      );
      showToast(localizeErrorMessage(message, "状态刷新超时"), "err");
      return false;
    }
  }, [loadThemePreviews, showToast, syncActiveImage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      label: string,
      action: () => Promise<{ ok: boolean; message: string }>,
      options?: { successText?: string; overlayText?: string },
    ) => {
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      const overlayText = options?.overlayText || `${label}中…`;
      setBusy(true);
      setBusyLabel(overlayText);
      // let React paint the overlay before the heavy IPC call
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      let slowTimer: number | undefined;
      let actionSucceeded = false;
      try {
        slowTimer = window.setTimeout(() => {
          setBusyLabel("后台仍在处理，请勿重复操作…");
        }, ACTION_TIMEOUT_MS);
        // Engine commands enforce their own process timeout. Keep the UI locked
        // until IPC really settles so a soft timeout cannot enable a second action.
        const result = await action();
        const successText = options?.successText || "操作成功";
        const message = result.ok
          ? successText
          : localizeErrorMessage(result.message || `${label}失败`);
        actionSucceeded = result.ok;
        showToast(message, result.ok ? "ok" : "err");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showToast(localizeErrorMessage(message), "err");
      } finally {
        if (slowTimer !== undefined) window.clearTimeout(slowTimer);
        actionInFlightRef.current = false;
        setBusy(false);
        setBusyLabel("处理中…");
        // Do not keep the blocking overlay up while the theme library reloads
        // and serializes all preview images over IPC. A successful engine
        // action must not be replaced by a transient status-poll timeout.
        void (async () => {
          const attempts = actionSucceeded ? POST_ACTION_REFRESH_ATTEMPTS : 1;
          for (let attempt = 0; attempt < attempts; attempt += 1) {
            if (await refresh({ silent: actionSucceeded })) return;
            if (attempt + 1 < attempts) {
              await new Promise((resolve) => window.setTimeout(resolve, 750));
            }
          }
        })();
      }
    },
    [refresh, showToast],
  );

  const formFields = useMemo(
    () => ({
      // 未填写主题名时，使用图片文件名（去扩展名）
      name: resolveThemeName(themeName, selectedImage?.name),
      appearance,
      safeArea,
      taskMode,
      homeLayout,
      focusX: useCustomFocus ? focusX / 100 : undefined,
      focusY: useCustomFocus ? focusY / 100 : undefined,
      surfaceStyle,
      cardSize,
      heroTitle: heroTitle.trim(),
      heroSubtitle: heroSubtitle.trim(),
      projectLabel: projectLabel.trim(),
      statusText: statusText.trim(),
      accentColor: useCustomAccent ? accentColor : undefined,
      saveLibrary: true,
    }),
    [
      accentColor,
      appearance,
      cardSize,
      focusX,
      focusY,
      heroSubtitle,
      heroTitle,
      homeLayout,
      projectLabel,
      safeArea,
      selectedImage,
      statusText,
      surfaceStyle,
      taskMode,
      themeName,
      useCustomAccent,
      useCustomFocus,
    ],
  );

  const importSelectedImage = useCallback(
    async (options?: { applyNow?: boolean }) => {
      if (!selectedImage) {
        throw new Error("请先选择一张图片");
      }
      const current = selectedImage;
      const applyNow = options?.applyNow ?? true;
      const base = {
        ...formFields,
        saveLibrary: true,
        applyNow,
      };
      const result =
        current.source === "path"
          ? await api.importTheme({
              ...base,
              path: current.path,
            })
          : await api.importTheme({
              ...base,
              fileBase64: await fileToBase64(current.file, selectedImageLimit),
              fileName: current.file.name,
            });
      if (result.ok) {
        setSelectedImage(null);
        setThemeName("");
      }
      return result;
    },
    [formFields, selectedImage, selectedImageLimit],
  );


  const acceptSelectedImage = useCallback(
    (next: SelectedImage | null) => {
      if (!next) {
        setSelectedImage(null);
        return;
      }
      if (!isImageFileName(next.name)) {
        showToast("请拖入图片文件（png/jpg/webp/heic/tiff）", "err");
        return;
      }
      if (isWindows && !WINDOWS_IMAGE_EXT.test(next.name)) {
        showToast("Windows 仅支持 PNG、JPEG 和 WebP 图片", "err");
        return;
      }
      if (next.source === "file" && next.size > selectedImageLimit) {
        showToast(
          `图片超过 ${Math.round(selectedImageLimit / 1024 / 1024)}MB，请压缩后重试`,
          "err",
        );
        return;
      }
      setSelectedImage(next);
      // 主题名为空时，自动填入图片名；用户已填写则不覆盖
      if (!themeName.trim()) {
        setThemeName(themeNameFromImage(next.name));
      }
    },
    [isWindows, selectedImageLimit, showToast, themeName],
  );

  const openNativePicker = useCallback(async () => {
    try {
      const path = await api.pickImagePath();
      if (!path) return;
      acceptSelectedImage({ source: "path", path, name: fileNameFromPath(path) });
    } catch {
      // Native dialog unavailable: fall back to the hidden HTML input.
      fileInputRef.current?.click();
    }
  }, [acceptSelectedImage]);

  useEffect(() => {
    let cancelled = false;

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!selectedImage) {
      revokeObjectUrl();
      setPreviewUrl(null);
      return;
    }

    if (selectedImage.source === "file") {
      revokeObjectUrl();
      const url = URL.createObjectURL(selectedImage.file);
      objectUrlRef.current = url;
      setPreviewUrl(url);
      return () => {
        cancelled = true;
        revokeObjectUrl();
      };
    }

    setPreviewUrl(null);
    void api
      .previewImage(selectedImage.path)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const pointInDropzone = useCallback((clientX: number, clientY: number) => {
    const el = dropzoneRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  // Tauri intercepts OS file drops; HTML5 onDrop alone is unreliable.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    try {
      const currentWebview = getCurrentWebview();
      void currentWebview.onDragDropEvent((event) => {
        if (disposed || !installed) return;
        const payload = event.payload;
        if (payload.type === "leave") {
          setDragOver(false);
          return;
        }

        const scale = window.devicePixelRatio || 1;
        const clientX = payload.position.x / scale;
        const clientY = payload.position.y / scale;
        const over = pointInDropzone(clientX, clientY);

        if (payload.type === "enter" || payload.type === "over") {
          setDragOver(over);
          return;
        }

        if (payload.type === "drop") {
          setDragOver(false);
          const path = payload.paths.find((item) => isImageFileName(fileNameFromPath(item)));
          if (!path) {
            // Only warn when the pointer is near the dropzone.
            if (over) {
              showToast("请拖入图片文件（png/jpg/webp/heic/tiff）", "err");
            }
            return;
          }
          // Accept OS drops even if titlebar/DPI slightly offsets the hit test.
          const name = fileNameFromPath(path);
          acceptSelectedImage({ source: "path", path, name });
        }
      })
        .then((fn) => {
          if (disposed) {
            fn();
            return;
          }
          unlisten = fn;
        })
        .catch(() => {
          // Browser preview without Tauri APIs: keep HTML5 handlers only.
        });
    } catch {
      // Browser preview without Tauri globals: keep HTML5 handlers only.
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [acceptSelectedImage, installed, pointInDropzone, showToast]);

  const liveClass = !status
    ? "off"
    : !status.installed
      ? "warn"
      : status.session === "active" && status.injectorAlive
        ? "on"
        : status.session === "paused"
          ? "warn"
          : "off";

  const liveText = !status
    ? "检测中"
    : !status.installed
      ? "待安装"
      : status.session === "active" && status.injectorAlive
        ? "皮肤生效中"
        : status.session === "paused"
          ? "已暂停"
          : "待命";

  return (
    <>
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="grain" aria-hidden />
      <div className="orb orb-a" aria-hidden />
      <div className="orb orb-b" aria-hidden />

      <header className="top" data-tauri-drag-region>
        <div className="brand">
          <div>
            <p className="eyebrow">Codex Desktop · Local CDP · {status?.platform || "…"}</p>
            <h1 onClick={() => void revealDiagnostics()}>Dream Skin 换肤台</h1>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="ghost"
            title="复制 Codex Dream Skin 中文纯背景生图提示词"
            onClick={() => void copyBackgroundPrompt()}
          >
            复制生图提示词
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => void refresh()}>
            刷新状态
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !canInstall}
            title="用应用内置资源重装注入器 / 引擎（请先完全退出 Codex）"
            onClick={() => {
              openConfirmDialog({
                steps: [
                  {
                    title: "确认重新安装注入器？",
                    body: "会用当前应用内置资源覆盖本机引擎，并重新注册注入。请先完全退出 Codex / ChatGPT 桌面端。",
                    confirmLabel: "确认安装",
                  },
                ],
                onConfirm: () => {
                  void runAction("重新安装注入器", () => api.install(), {
                    overlayText: "正在重新安装注入器…",
                    successText: "注入器已重新安装",
                  });
                },
              });
            }}
          >
            重新安装注入器
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !installed}
            onClick={() => {
              openConfirmDialog({
                danger: true,
                steps: [
                  {
                    title: "确认恢复官方外观？",
                    body: "会停止 Dream Skin 注入，并尽量还原 Codex 官方外观设置。恢复后当前皮肤将立即失效，需重新应用主题才能换肤。",
                    confirmLabel: "确认恢复",
                  },
                ],
                onConfirm: () => {
                  void runAction("恢复官方外观", () => api.restore(), {
                    overlayText: "正在恢复官方外观…",
                    successText: "已恢复官方外观",
                  });
                },
              });
            }}
          >
            恢复官方
          </button>
          <span className={`live-pill ${liveClass}`}>{liveText}</span>
        </div>
      </header>

      {!installed ? (
        <section className="panel install-banner">
          <div>
            <p className="eyebrow">傻瓜式安装</p>
            <h2>一键安装 Dream Skin 引擎</h2>
            <p className="muted">
              {status?.installHint ||
                "会把引擎装到本机用户目录，不修改官方 Codex / ChatGPT 安装包。"}
            </p>
            <ul className="install-steps">
              {status?.platform === "windows" ? (
                <>
                  <li>1. 安装 Node.js 22+（https://nodejs.org，勾选 Add to PATH）</li>
                  <li>2. 安装后重新打开本应用，并完全退出 Codex / ChatGPT</li>
                  <li>3. 点击下方「一键安装引擎」</li>
                  <li>4. 安装完成后在主题库点选主题即可换肤</li>
                </>
              ) : (
                <>
                  <li>1. 先完全退出 Codex / ChatGPT 桌面端</li>
                  <li>2. 点击下方「一键安装引擎」</li>
                  <li>3. 安装完成后在主题库点选主题即可换肤</li>
                </>
              )}
            </ul>
          </div>
          <div className="action-bar">
            <button
              type="button"
              className="primary"
              disabled={busy || !canInstall}
              onClick={() =>
                void runAction("安装引擎", () => api.install(), {
                  overlayText: "正在安装引擎…",
                  successText: "引擎安装成功",
                })
              }
            >
              一键安装引擎
            </button>
            <button type="button" className="soft" disabled={busy} onClick={() => void refresh()}>
              重新检测
            </button>
          </div>
        </section>
      ) : null}

      <main className="layout">
        <section className="panel stage">
          <div className="stage-frame">
            <div
              className="stage-art"
              style={{
                backgroundImage: activeImage ? `url(${activeImage})` : "none",
              }}
            />
            <div className="stage-scrim" />
            <div className="stage-copy">
              <p className="eyebrow">当前皮肤</p>
              <h2>{status?.appliedThemeName || (installed ? "—" : "引擎未安装")}</h2>
              <p className="muted">
                {!status
                  ? "等待读取引擎状态…"
                  : [
                      status.installed ? `会话 ${status.session}` : "引擎未安装",
                      `端口 ${status.port}`,
                      status.codexRunning ? "Codex 运行中" : "Codex 未运行",
                      status.engineVersion ? `引擎 ${status.engineVersion}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
              <div className="chip-row">
                <Chip
                  text={status?.installed ? "引擎已就绪" : "需要安装引擎"}
                  kind={status?.installed ? "ok" : "warn"}
                />
                <Chip
                  text={status?.injectorAlive ? "注入器在线" : "注入器离线"}
                  kind={status?.injectorAlive ? "ok" : "warn"}
                />
                <Chip
                  text={status?.codexRunning ? "桌面端在线" : "桌面端离线"}
                  kind={status?.codexRunning ? "ok" : ""}
                />
                <Chip
                  text={
                    status?.platform === "windows"
                      ? "Windows"
                      : status?.platform === "macos"
                        ? "macOS"
                        : "浏览器预览"
                  }
                />
              </div>
            </div>
          </div>

        </section>

        <section className={`panel import${installed ? "" : " is-disabled"}`}>
          <label
            ref={dropzoneRef}
            className={`dropzone${dragOver ? " drag" : ""}${previewUrl ? " has-preview" : ""}`}
            onClick={(event) => {
              if (!installed || IS_BROWSER_PREVIEW) return;
              // Fallback clicks forwarded to the input keep default behavior.
              if (event.target === fileInputRef.current) return;
              // Native picker returns a plain path: no base64 trip over IPC.
              event.preventDefault();
              void openNativePicker();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (installed) setDragOver(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
              if (installed) setDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const next = event.relatedTarget as Node | null;
              if (next && event.currentTarget.contains(next)) return;
              setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragOver(false);
              if (!installed) return;
              const file = event.dataTransfer.files?.[0];
              if (file) {
                acceptSelectedImage({
                  source: "file",
                  file,
                  name: file.name,
                  size: file.size,
                });
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept={isWindows ? ".png,.jpg,.jpeg,.webp" : "image/*,.heic,.tif,.tiff"}
              hidden
              disabled={!installed}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                if (!file) {
                  setSelectedImage(null);
                  return;
                }
                acceptSelectedImage({
                  source: "file",
                  file,
                  name: file.name,
                  size: file.size,
                });
                event.target.value = "";
              }}
            />
            {previewUrl ? (
              <div className="dropzone-preview" aria-hidden>
                <img src={previewUrl} alt="" />
              </div>
            ) : null}
            <div className={`dropzone-copy${previewUrl ? " has-preview" : ""}`}>
              <strong>
                {!installed
                  ? "请先安装引擎"
                  : selectedImage
                    ? selectedImage.name
                    : "拖入图片，或点击选择"}
              </strong>
              <span>
                {selectedImage
                  ? selectedImage.source === "file"
                    ? `${Math.round(selectedImage.size / 1024)} KB · 点下方按钮应用`
                    : "已拖入本地图片 · 点下方按钮应用"
                  : isWindows
                    ? "建议 2560×1440 · PNG/JPEG/WebP · ≤16MB"
                    : "建议 2560×1440 · 无侧栏/按钮/文字 · ≤50MB"}
              </span>
            </div>
          </label>

          <div className="form-grid">
            <label>
              主题名
              <input
                type="text"
                maxLength={40}
                placeholder="例如：午夜书房"
                value={themeName}
                disabled={!installed}
                onChange={(event) => setThemeName(event.target.value)}
              />
            </label>
            <label>
              外观
              <select
                value={appearance}
                disabled={!installed}
                onChange={(event) => setAppearance(event.target.value)}
              >
                <option value="auto">跟随 Codex / 系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>
              安全区
              <select
                value={safeArea}
                disabled={!installed}
                onChange={(event) => setSafeArea(event.target.value)}
              >
                <option value="auto">自动</option>
                <option value="left">左侧留给内容</option>
                <option value="right">右侧留给内容</option>
                <option value="center">居中</option>
                <option value="none">无</option>
              </select>
            </label>
            <label>
              任务页模式
              <select
                value={taskMode}
                disabled={!installed}
                onChange={(event) => setTaskMode(event.target.value)}
              >
                <option value="auto">自动</option>
                <option value="ambient">环境氛围</option>
                <option value="banner">横幅</option>
                <option value="off">任务页关背景</option>
              </select>
            </label>
          </div>

          <div className="advanced-settings">
            <button
              type="button"
              className="advanced-toggle"
              aria-haspopup="dialog"
              aria-expanded={advancedOpen}
              aria-controls="advanced-settings-dialog"
              disabled={!installed}
              onClick={() => setAdvancedOpen(true)}
            >
              <span>
                <strong>更多设置</strong>
                <small>构图 / 卡片 / 主体位置 / 首页文案 / 强调色（点开后可滚动查看全部）</small>
              </span>
              <span className="advanced-toggle-icon" aria-hidden>
                ↗
              </span>
            </button>
          </div>

          <div className="action-bar">
            <button
              type="button"
              className="apply-btn"
              disabled={busy || !installed || !selectedImage}
              onClick={() => {
                void runAction("应用已选图片", () => importSelectedImage({ applyNow: true }), {
                  overlayText: "正在应用已选图片…",
                  successText: "图片主题应用成功",
                });
              }}
            >
              应用已选图片
            </button>
            <button
              type="button"
              className="library-btn"
              disabled={busy || !installed || !selectedImage}
              onClick={() => {
                void runAction(
                  "添加到主题库",
                  () => importSelectedImage({ applyNow: false }),
                  {
                    overlayText: "正在添加到主题库…",
                    successText: "已添加到主题库",
                  },
                );
              }}
            >
              添加到主题库
            </button>
          </div>
        </section>

        <section className={`panel library${installed ? "" : " is-disabled"}`}>
          <div className="section-head">
            <div>
              <p className="eyebrow">主题库</p>
              <h3>一键切换已保存皮肤</h3>
            </div>
            <span className="count">{themes.length}</span>
          </div>
          <div className="theme-grid">
            {!installed ? (
              <div className="empty">安装引擎后会显示预设与自定义主题。</div>
            ) : !themes.length ? (
              <div className="empty">还没有保存的主题。导入一张图片，或安装后自动播种预设。</div>
            ) : (
              themes.map((theme) => (
                <div
                  key={theme.id}
                  className={`theme-card${theme.id === status?.appliedThemeId ? " active" : ""}`}
                >
                  <div
                    className="thumb"
                    style={{
                      backgroundImage: theme.previewDataUrl
                        ? `url(${theme.previewDataUrl})`
                        : undefined,
                    }}
                  >
                    <div className="theme-actions" aria-hidden={busy}>
                      <button
                        type="button"
                        className="theme-action apply"
                        disabled={busy}
                        title="应用主题"
                        aria-label={`应用主题 ${theme.name}`}
                        onClick={() =>
                          void runAction(
                            "切换主题",
                            () => api.switchTheme(theme.id),
                            {
                              overlayText: `正在换肤：${theme.name}`,
                              successText: `换肤成功：${theme.name}`,
                            },
                          )
                        }
                      >
                        <svg className="ui-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3.5l1.95 4.55 4.95.45-3.75 3.3 1.15 4.85L12 14.4l-4.3 2.65 1.15-4.85-3.75-3.3 4.95-.45L12 3.5z" />
                        </svg>
                      </button>
                      <span className="theme-action-divider" />
                      <button
                        type="button"
                        className="theme-action delete"
                        disabled={busy}
                        title="删除主题"
                        aria-label={`删除主题 ${theme.name}`}
                        onClick={() => {
                          openConfirmDialog({
                            danger: true,
                            steps: [
                              {
                                title: "删除主题？",
                                body: `确定删除主题「${theme.name}」？此操作不可撤销。`,
                                confirmLabel: "确认删除",
                              },
                            ],
                            onConfirm: () => {
                              void runAction(
                                "删除主题",
                                () => api.deleteTheme(theme.id),
                                {
                                  overlayText: `正在删除：${theme.name}`,
                                  successText: `已删除：${theme.name}`,
                                },
                              );
                            },
                          });
                        }}
                      >
                        <svg className="ui-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 7h14" />
                          <path d="M9.5 7V5.8c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8V7" />
                          <path d="M8.2 7l.7 12.2c.04.55.5.98 1.05.98h4.1c.55 0 1.01-.43 1.05-.98L15.8 7" />
                          <path d="M10.2 11.2v5.2M13.8 11.2v5.2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="tag">{theme.kind === "preset" ? "预设" : "自定义"}</div>
                  <div className="body">
                    <strong>{theme.name}</strong>
                    <span>{theme.tagline || theme.id}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {advancedOpen ? (
        <div
          className="advanced-modal-overlay"
          role="presentation"
          onClick={() => setAdvancedOpen(false)}
        >
          <div
            id="advanced-settings-dialog"
            className="advanced-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="advanced-modal-header">
              <div>
                <strong id="advanced-settings-title">更多设置</strong>
                <small>内容较多时可向下滚动；含构图、卡片、文案与强调色</small>
              </div>
              <button
                type="button"
                className="advanced-modal-close"
                aria-label="关闭更多设置"
                onClick={() => setAdvancedOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="advanced-body">
                <div className="advanced-intro">
                  <span className="advanced-kicker">构图与质感</span>
                  <span>各项均可自行调整；未改时使用推荐默认值。</span>
                </div>
                <div className="advanced-grid advanced-layout-grid">
                  <label>
                    首页构图
                    <select
                      value={homeLayout}
                      disabled={!installed}
                      onChange={(event) => setHomeLayout(event.target.value)}
                    >
                      <option value="auto">自动判断（推荐）</option>
                      <option value="framed">画框式</option>
                      <option value="immersive">沉浸铺满</option>
                    </select>
                  </label>
                  <label>
                    界面质感
                    <select
                      value={surfaceStyle}
                      disabled={!installed}
                      onChange={(event) => setSurfaceStyle(event.target.value)}
                    >
                      <option value="glass">通透玻璃</option>
                      <option value="balanced">平衡</option>
                      <option value="solid">实色清晰（推荐）</option>
                    </select>
                  </label>
                  <label>
                    建议卡片
                    <select
                      value={cardSize}
                      disabled={!installed}
                      onChange={(event) => setCardSize(event.target.value)}
                    >
                      <option value="compact">紧凑</option>
                      <option value="balanced">标准（推荐）</option>
                      <option value="showcase">展示型大卡片</option>
                    </select>
                  </label>
                  <label className="focus-setting-field">
                    图片主体位置
                    <div className="focus-setting-control">
                      <span className="accent-toggle focus-setting-toggle">
                        <input
                          type="checkbox"
                          checked={useCustomFocus}
                          disabled={!installed}
                          onChange={(event) => setUseCustomFocus(event.target.checked)}
                        />
                        <span>{useCustomFocus ? "手动调节" : "自动识别"}</span>
                      </span>
                    </div>
                  </label>
                </div>
                <div className={`focus-sliders${useCustomFocus ? "" : " is-disabled"}`}>
                  <label className="focus-slider">
                    <span><span>水平位置</span><code>{focusX}%</code></span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={focusX}
                      disabled={!installed || !useCustomFocus}
                      aria-label="图片主体水平位置"
                      onChange={(event) => setFocusX(Number(event.target.value))}
                    />
                    <small><span>左</span><span>右</span></small>
                  </label>
                  <label className="focus-slider">
                    <span><span>垂直位置</span><code>{focusY}%</code></span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={focusY}
                      disabled={!installed || !useCustomFocus}
                      aria-label="图片主体垂直位置"
                      onChange={(event) => setFocusY(Number(event.target.value))}
                    />
                    <small><span>上</span><span>下</span></small>
                  </label>
                </div>
                <div className="advanced-intro">
                  <span className="advanced-kicker">首页内容</span>
                  <span>这些文案会写入主题；应用主题后，在 Codex 首页即可看到。</span>
                </div>
                <div className="advanced-grid">
                  <label>
                    主视觉标题
                    <input
                      type="text"
                      maxLength={60}
                      placeholder={DEFAULT_HERO_TITLE}
                      value={heroTitle}
                      disabled={!installed}
                      onChange={(event) => setHeroTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    主视觉副标题
                    <input
                      type="text"
                      maxLength={120}
                      placeholder={DEFAULT_HERO_SUBTITLE}
                      value={heroSubtitle}
                      disabled={!installed}
                      onChange={(event) => setHeroSubtitle(event.target.value)}
                    />
                  </label>
                  <label>
                    项目入口文案
                    <input
                      type="text"
                      maxLength={40}
                      placeholder={DEFAULT_PROJECT_LABEL}
                      value={projectLabel}
                      disabled={!installed}
                      onChange={(event) => setProjectLabel(event.target.value)}
                    />
                  </label>
                  <label>
                    状态短句
                    <input
                      type="text"
                      maxLength={40}
                      placeholder={DEFAULT_STATUS_TEXT}
                      value={statusText}
                      disabled={!installed}
                      onChange={(event) => setStatusText(event.target.value)}
                    />
                  </label>
                </div>
                <div className="advanced-footer">
                  <div className="accent-setting">
                    <span>强调色</span>
                    <span className="accent-control">
                      <label className="accent-toggle">
                        <input
                          type="checkbox"
                          checked={useCustomAccent}
                          disabled={!installed}
                          onChange={(event) => setUseCustomAccent(event.target.checked)}
                        />
                        <span>自定义</span>
                      </label>
                      <input
                        className="accent-picker"
                        type="color"
                        value={accentColor}
                        disabled={!installed || !useCustomAccent}
                        aria-label="选择主题强调色"
                        onChange={(event) => setAccentColor(event.target.value)}
                      />
                      <code>{useCustomAccent ? accentColor.toUpperCase() : "跟随图片"}</code>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="advanced-reset"
                    disabled={!installed}
                    onClick={() => {
                      setAppearance("auto");
                      setSafeArea("auto");
                      setTaskMode("auto");
                      setHeroTitle(DEFAULT_HERO_TITLE);
                      setHeroSubtitle(DEFAULT_HERO_SUBTITLE);
                      setProjectLabel(DEFAULT_PROJECT_LABEL);
                      setStatusText(DEFAULT_STATUS_TEXT);
                      setAccentColor(DEFAULT_ACCENT_COLOR);
                      setUseCustomAccent(false);
                      setHomeLayout(DEFAULT_HOME_LAYOUT);
                      setSurfaceStyle(DEFAULT_SURFACE_STYLE);
                      setCardSize(DEFAULT_CARD_SIZE);
                      setUseCustomFocus(false);
                      setFocusX(DEFAULT_FOCUS_X);
                      setFocusY(DEFAULT_FOCUS_Y);
                    }}
                  >
                    恢复默认
                  </button>
                </div>
              </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={closeConfirmDialog}
        >
          <div
            className={`confirm-modal${confirmDialog.danger ? " is-danger" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <p className="confirm-kicker">
                  {confirmDialog.steps.length > 1
                    ? `确认 ${confirmDialog.stepIndex + 1}/${confirmDialog.steps.length}`
                    : "请确认"}
                </p>
                <strong id="confirm-dialog-title">
                  {confirmDialog.steps[confirmDialog.stepIndex]?.title}
                </strong>
              </div>
              <button
                type="button"
                className="advanced-modal-close"
                aria-label="关闭确认"
                onClick={closeConfirmDialog}
              >
                ×
              </button>
            </div>
            <p className="confirm-modal-body">
              {confirmDialog.steps[confirmDialog.stepIndex]?.body}
            </p>
            <div className="confirm-modal-actions">
              <button type="button" className="soft" onClick={closeConfirmDialog}>
                取消
              </button>
              <button
                type="button"
                className={confirmDialog.danger ? "danger" : "primary"}
                onClick={advanceConfirmDialog}
              >
                {confirmDialog.steps[confirmDialog.stepIndex]?.confirmLabel ||
                  (confirmDialog.stepIndex < confirmDialog.steps.length - 1
                    ? "继续"
                    : "确认")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="busy-overlay" role="alert" aria-live="assertive">
          <div className="busy-card">
            <div className="busy-spinner" aria-hidden />
            <strong>{busyLabel}</strong>
            <p>换肤过程可能需要几秒到几十秒，请稍候，不要关闭应用</p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`result-overlay ${toast.kind}`}
          role="status"
          aria-live="polite"
          onClick={dismissToast}
        >
          <div className={`result-card ${toast.kind}`}>
            <div className="result-icon" aria-hidden>
              {toast.kind === "ok" ? "✓" : "!"}
            </div>
            <strong>{toast.kind === "ok" ? "完成" : "失败"}</strong>
            <p>{toast.message}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
