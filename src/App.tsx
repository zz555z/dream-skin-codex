import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api } from "./lib/api";
import { localizeErrorMessage } from "./lib/localizeError";
import { BACKGROUND_AI_PROMPT_ZH } from "./lib/backgroundPrompt";
import { fileNameFromPath, isImageFileName } from "./lib/themeName";
import { withTimeout } from "./lib/withTimeout";
import { useEngineStatus } from "./hooks/useEngineStatus";
import { useConfirmDialog } from "./hooks/useConfirmDialog";
import { useImageImport } from "./hooks/useImageImport";
import { AppHeader } from "./components/AppHeader";
import { BusyOverlay } from "./components/BusyOverlay";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { InstallBanner } from "./components/InstallBanner";
import { StagePanel } from "./components/StagePanel";
import { ThemeLibrary } from "./components/ThemeLibrary";
import { ToastOverlay } from "./components/ToastOverlay";
import { ImportPanel } from "./components/ImportPanel";
import { AdvancedSettingsDialog } from "./components/AdvancedSettingsDialog";

const ACTION_TIMEOUT_MS = 120_000;

export default function App() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [busyLabel, setBusyLabel] = useState("处理中…");
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "err" } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const diagnosticClicksRef = useRef(0);

  const showToast = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), kind === "err" ? 4200 : 1800);
  }, []);

  const { status, themes, refresh, setStatus, loadThemePreview } = useEngineStatus({
    busy,
    showToast,
  });

  const installed = Boolean(status?.installed);
  const canInstall = Boolean(status?.canInstall);

  const {
    confirmDialog,
    openConfirmDialog,
    closeConfirmDialog,
    advanceConfirmDialog,
  } = useConfirmDialog();

  const {
    selectedImage,
    setSelectedImage,
    draft,
    dispatchDraft,
    dragOver,
    setDragOver,
    previewUrl,
    dropzoneRef,
    acceptSelectedImage,
    importSelectedImage,
    pointInDropzone,
  } = useImageImport({
    installed,
    showToast,
  });

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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
        if (document.querySelector(".confirm-modal-overlay")) return;
        setAdvancedOpen(false);
      }
    };

    const onWheel = (event: WheelEvent) => {
      const scrollable = getScrollableAncestor(event.target);
      if (scrollable && canScroll(scrollable, event.deltaY)) return;
      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      const scrollable = getScrollableAncestor(event.target);
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 1) return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
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

  const runAction = useCallback(
    async (
      label: string,
      action: () => Promise<{ ok: boolean; message: string }>,
      options?: { successText?: string; overlayText?: string },
    ) => {
      if (busy) return;
      const overlayText = options?.overlayText || `${label}中…`;
      setBusy(true);
      setBusyLabel(overlayText);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      try {
        const result = await withTimeout(action(), ACTION_TIMEOUT_MS);
        const successText = options?.successText || "操作成功";
        const message = result.ok
          ? successText
          : localizeErrorMessage(result.message || `${label}失败`);
        showToast(message, result.ok ? "ok" : "err");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        let recovered = false;
        try {
          const nextStatus = await withTimeout(api.getStatus(), 8000);
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
          // Only treat as success when a live session is visible. Having an
          // older appliedThemeId alone must not mask a real timeout/failure.
          if (
            nextStatus.installed &&
            (nextStatus.injectorAlive ||
              nextStatus.session === "active" ||
              nextStatus.session === "paused")
          ) {
            recovered = true;
            showToast(options?.successText || "操作可能已完成，请确认 Codex 窗口", "ok");
          }
        } catch {
          // fall through to timeout message
        }
        if (!recovered) {
          showToast(localizeErrorMessage(message), "err");
        }
      } finally {
        setBusy(false);
        setBusyLabel("处理中…");
        void refresh({ silent: true, forceThemes: true });
      }
    },
    [busy, refresh, setStatus, showToast],
  );

  // Tauri intercepts OS file drops; HTML5 onDrop alone is unreliable.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    try {
      const currentWebview = getCurrentWebview();
      void currentWebview
        .onDragDropEvent((event) => {
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
              if (over) {
                showToast("请拖入图片文件（png/jpg/webp/heic/tiff）", "err");
              }
              return;
            }
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
  }, [acceptSelectedImage, installed, pointInDropzone, setDragOver, showToast]);

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

      <AppHeader
        platform={status?.platform}
        busy={busy}
        canInstall={canInstall}
        installed={installed}
        liveClass={liveClass}
        liveText={liveText}
        onTitleClick={() => void revealDiagnostics()}
        onCopyPrompt={() => void copyBackgroundPrompt()}
        onRefresh={() => void refresh({ silent: false, forceThemes: true })}
        onReinstall={() => {
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
        onRestore={() => {
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
      />

      {!installed ? (
        <InstallBanner
          platform={status?.platform}
          installHint={status?.installHint}
          busy={busy}
          canInstall={canInstall}
          onInstall={() =>
            void runAction("安装引擎", () => api.install(), {
              overlayText: "正在安装引擎…",
              successText: "引擎安装成功",
            })
          }
          onRefresh={() => void refresh({ silent: false, forceThemes: true })}
        />
      ) : null}

      <main className="layout">
        <StagePanel status={status} installed={installed} />

        <ImportPanel
          installed={installed}
          busy={busy}
          selectedImage={selectedImage}
          previewUrl={previewUrl}
          dragOver={dragOver}
          draft={draft}
          dispatchDraft={dispatchDraft}
          dropzoneRef={dropzoneRef}
          advancedOpen={advancedOpen}
          onOpenAdvanced={() => setAdvancedOpen(true)}
          onAcceptFile={(file) =>
            acceptSelectedImage({
              source: "file",
              file,
              name: file.name,
              size: file.size,
            })
          }
          onClearImage={() => setSelectedImage(null)}
          onApply={() => {
            void runAction("应用已选图片", () => importSelectedImage({ applyNow: true }), {
              overlayText: "正在应用已选图片…",
              successText: "图片主题应用成功",
            });
          }}
          onSaveLibrary={() => {
            void runAction("添加到主题库", () => importSelectedImage({ applyNow: false }), {
              overlayText: "正在添加到主题库…",
              successText: "已添加到主题库",
            });
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
        />

        <ThemeLibrary
          installed={installed}
          busy={busy}
          themes={themes}
          status={status}
          onRequestPreview={(themeId) => void loadThemePreview(themeId)}
          onApply={(theme) =>
            void runAction("切换主题", () => api.switchTheme(theme.id), {
              overlayText: `正在换肤：${theme.name}`,
              successText: `换肤成功：${theme.name}`,
            })
          }
          onDelete={(theme) => {
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
                void runAction("删除主题", () => api.deleteTheme(theme.id), {
                  overlayText: `正在删除：${theme.name}`,
                  successText: `已删除：${theme.name}`,
                });
              },
            });
          }}
        />
      </main>

      {advancedOpen ? (
        <AdvancedSettingsDialog
          installed={installed}
          draft={draft}
          dispatchDraft={dispatchDraft}
          onClose={() => setAdvancedOpen(false)}
        />
      ) : null}

      {confirmDialog ? (
        <ConfirmDialog
          dialog={confirmDialog}
          onClose={closeConfirmDialog}
          onAdvance={advanceConfirmDialog}
        />
      ) : null}

      {busy ? <BusyOverlay label={busyLabel} /> : null}
      {toast ? <ToastOverlay toast={toast} /> : null}
    </>
  );
}
