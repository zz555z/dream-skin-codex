import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, fileToBase64 } from "./lib/api";
import type { StatusSnapshot, ThemeSummary } from "./types";
import { BACKGROUND_AI_PROMPT_ZH } from "./lib/backgroundPrompt";

type SelectedImage =
  | { source: "file"; file: File; name: string; size: number }
  | { source: "path"; path: string; name: string; size?: number };

const IMAGE_EXT = /\.(png|jpe?g|webp|heic|tif{1,2})$/i;

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name);
}

function Chip({ text, kind = "" }: { text: string; kind?: string }) {
  return <span className={`chip ${kind}`.trim()}>{text}</span>;
}

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
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLLabelElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const installed = Boolean(status?.installed);
  const canInstall = Boolean(status?.canInstall);

  const showToast = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 1000);
  }, []);

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
      showToast(message || "复制失败", "err");
    }
  }, [showToast]);

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await api.getStatus();
      setStatus(nextStatus);
      if (nextStatus.installed) {
        try {
          setThemes(await api.getThemes());
        } catch {
          setThemes([]);
        }
      } else {
        setThemes([]);
      }
      if (!nextStatus.installed) {
      } else if (!busy) {
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(message, "err");
    }
  }, [busy, showToast]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!busy) void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [busy, refresh]);

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
      // let React paint the overlay before the heavy IPC call
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      try {
        const result = await action();
        const successText = options?.successText || "操作成功";
        const message = result.ok
          ? successText
          : result.message || `${label}失败`;
        showToast(message, result.ok ? "ok" : "err");
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showToast(message, "err");
      } finally {
        setBusy(false);
        setBusyLabel("处理中…");
      }
    },
    [busy, refresh, showToast],
  );

  const formFields = useMemo(
    () => ({
      name:
        themeName.trim() ||
        selectedImage?.name.replace(/\.[^.]+$/, "") ||
        "我的主题",
      appearance,
      safeArea,
      taskMode,
      saveLibrary: true,
    }),
    [appearance, safeArea, selectedImage, taskMode, themeName],
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
      setSelectedImage(next);
      if (!themeName.trim()) {
        setThemeName(next.name.replace(/\.[^.]+$/, ""));
      }
    },
    [showToast, themeName],
  );

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

    void getCurrentWebview()
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
          <span className="mark">◉</span>
          <div>
            <p className="eyebrow">Codex Desktop · Local CDP · {status?.platform || "…"}</p>
            <h1>Dream Skin 换肤台</h1>
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
            className="danger"
            disabled={busy || !installed}
            onClick={() => {
              if (!window.confirm("确认恢复官方外观？会停止注入并尽量还原外观设置。")) return;
              void runAction("恢复官方外观", () => api.restore(), {
                overlayText: "正在恢复官方外观…",
                successText: "已恢复官方外观",
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
              <li>1. 先完全退出 Codex / ChatGPT 桌面端</li>
              <li>2. 点击下方「一键安装引擎」</li>
              <li>3. 安装完成后在主题库点选主题即可换肤</li>
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
                backgroundImage: status?.activeImageDataUrl
                  ? `url(${status.activeImageDataUrl})`
                  : "none",
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
                <Chip text={status?.platform === "windows" ? "Windows" : "macOS"} />
              </div>
            </div>
          </div>

        </section>

        <section className={`panel import${installed ? "" : " is-disabled"}`}>
          <label
            ref={dropzoneRef}
            className={`dropzone${dragOver ? " drag" : ""}${previewUrl ? " has-preview" : ""}`}
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
              accept="image/*,.heic,.tif,.tiff"
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

          <div className="action-bar">
            <button
              type="button"
              className="apply-btn"
              disabled={busy || !installed || !selectedImage}
              onClick={() => {
                if (!selectedImage) return;
                const current = selectedImage;
                void runAction(
                  "应用已选图片",
                  async () => {
                    const result =
                      current.source === "path"
                        ? await api.importTheme({
                            ...formFields,
                            path: current.path,
                          })
                        : await api.importTheme({
                            ...formFields,
                            fileBase64: await fileToBase64(current.file),
                            fileName: current.file.name,
                          });
                    setSelectedImage(null);
                    return result;
                  },
                  {
                    overlayText: "正在应用已选图片…",
                    successText: "图片主题应用成功",
                  },
                );
              }}
            >
              应用已选图片
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
                          if (!window.confirm(`确定删除主题「${theme.name}」？此操作不可撤销。`)) {
                            return;
                          }
                          void runAction(
                            "删除主题",
                            () => api.deleteTheme(theme.id),
                            {
                              overlayText: `正在删除：${theme.name}`,
                              successText: `已删除：${theme.name}`,
                            },
                          );
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
        <div className={`result-overlay ${toast.kind}`} role="status" aria-live="polite">
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
