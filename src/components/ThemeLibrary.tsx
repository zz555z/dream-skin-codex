import { useEffect, useRef } from "react";
import type { StatusSnapshot, ThemeSummary } from "../types";

export function ThemeLibrary({
  installed,
  busy,
  themes,
  status,
  onApply,
  onDelete,
  onRequestPreview,
}: {
  installed: boolean;
  busy: boolean;
  themes: ThemeSummary[];
  status: StatusSnapshot | null;
  onApply: (theme: ThemeSummary) => void;
  onDelete: (theme: ThemeSummary) => void;
  onRequestPreview?: (themeId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onRequestPreview || !installed) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      // Fallback: warm first few cards.
      themes.slice(0, 6).forEach((theme) => {
        if (!theme.previewDataUrl) onRequestPreview(theme.id);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.themeId;
          if (id) onRequestPreview(id);
        }
      },
      {
        root: null,
        rootMargin: "120px 0px",
        threshold: 0.05,
      },
    );

    const cards = root.querySelectorAll<HTMLElement>("[data-theme-id]");
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [installed, onRequestPreview, themes]);

  return (
    <section className={`panel library${installed ? "" : " is-disabled"}`}>
      <div className="section-head">
        <div>
          <p className="eyebrow">主题库</p>
          <h3>一键切换已保存皮肤</h3>
        </div>
        <span className="count">{themes.length}</span>
      </div>
      <div className="theme-grid" ref={rootRef}>
        {!installed ? (
          <div className="empty">安装引擎后会显示预设与自定义主题。</div>
        ) : !themes.length ? (
          <div className="empty">还没有保存的主题。导入一张图片，或安装后自动播种预设。</div>
        ) : (
          themes.map((theme) => (
            <div
              key={theme.id}
              data-theme-id={theme.id}
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
                    onClick={() => onApply(theme)}
                  >
                    <svg
                      className="ui-icon"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
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
                    onClick={() => onDelete(theme)}
                  >
                    <svg
                      className="ui-icon"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
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
  );
}
