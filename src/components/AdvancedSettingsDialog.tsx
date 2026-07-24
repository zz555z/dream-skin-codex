import type { Dispatch } from "react";
import {
  DEFAULT_HERO_SUBTITLE,
  DEFAULT_HERO_TITLE,
  DEFAULT_IMPORT_DRAFT,
  DEFAULT_PROJECT_LABEL,
  DEFAULT_STATUS_TEXT,
  type ImportDraft,
  type ImportDraftAction,
} from "../lib/importDraft";

export function AdvancedSettingsDialog({
  installed,
  draft,
  dispatchDraft,
  onClose,
}: {
  installed: boolean;
  draft: ImportDraft;
  dispatchDraft: Dispatch<ImportDraftAction>;
  onClose: () => void;
}) {
  const {
    themeName,
    homeLayout,
    surfaceStyle,
    cardSize,
    useCustomFocus,
    focusX,
    focusY,
    heroTitle,
    heroSubtitle,
    projectLabel,
    statusText,
    accentColor,
    useCustomAccent,
  } = draft;

  return (
    <div className="advanced-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="advanced-modal"
        id="advanced-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="advanced-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="advanced-modal-header">
          <div>
            <p className="eyebrow">更多设置</p>
            <h3 id="advanced-settings-title">构图 / 卡片 / 文案 / 强调色</h3>
          </div>
          <button type="button" className="advanced-modal-close" aria-label="关闭更多设置" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="advanced-body">
          <div className="advanced-grid advanced-layout-grid">
            <label>
              首页构图
              <select
                value={homeLayout}
                disabled={!installed}
                onChange={(event) =>
                  dispatchDraft({ type: "patch", patch: { homeLayout: event.target.value } })
                }
              >
                <option value="auto">自动判断（推荐）</option>
                <option value="framed">画框式</option>
                <option value="immersive">沉浸铺满</option>
              </select>
            </label>
            <label>
              卡片风格
              <select
                value={surfaceStyle}
                disabled={!installed}
                onChange={(event) =>
                  dispatchDraft({ type: "patch", patch: { surfaceStyle: event.target.value } })
                }
              >
                <option value="glass">通透玻璃</option>
                <option value="balanced">平衡</option>
                <option value="solid">实色清晰（推荐）</option>
              </select>
            </label>
            <label>
              卡片大小
              <select
                value={cardSize}
                disabled={!installed}
                onChange={(event) =>
                  dispatchDraft({ type: "patch", patch: { cardSize: event.target.value } })
                }
              >
                <option value="compact">紧凑</option>
                <option value="balanced">标准（推荐）</option>
                <option value="showcase">展示型大卡片</option>
              </select>
            </label>
          </div>

          <div className="advanced-section">
            <div className="advanced-section-head">
              <strong>主体位置</strong>
              <label className="accent-toggle">
                <input
                  type="checkbox"
                  checked={useCustomFocus}
                  disabled={!installed}
                  onChange={(event) =>
                    dispatchDraft({
                      type: "patch",
                      patch: { useCustomFocus: event.target.checked },
                    })
                  }
                />
                <span>自定义</span>
              </label>
            </div>
            <div className="focus-sliders">
              <label>
                水平 {focusX}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focusX}
                  disabled={!installed || !useCustomFocus}
                  onChange={(event) =>
                    dispatchDraft({
                      type: "patch",
                      patch: { focusX: Number(event.target.value) },
                    })
                  }
                />
              </label>
              <label>
                垂直 {focusY}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focusY}
                  disabled={!installed || !useCustomFocus}
                  onChange={(event) =>
                    dispatchDraft({
                      type: "patch",
                      patch: { focusY: Number(event.target.value) },
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="advanced-section">
            <div className="advanced-section-head">
              <strong>首页文案</strong>
              <span>这些文案会写入主题；应用主题后，在 Codex 首页即可看到。</span>
            </div>
            <div className="advanced-grid">
              <label>
                标题
                <input
                  type="text"
                  maxLength={60}
                  placeholder={DEFAULT_HERO_TITLE}
                  value={heroTitle}
                  disabled={!installed}
                  onChange={(event) =>
                    dispatchDraft({ type: "patch", patch: { heroTitle: event.target.value } })
                  }
                />
              </label>
              <label>
                副标题
                <input
                  type="text"
                  maxLength={120}
                  placeholder={DEFAULT_HERO_SUBTITLE}
                  value={heroSubtitle}
                  disabled={!installed}
                  onChange={(event) =>
                    dispatchDraft({ type: "patch", patch: { heroSubtitle: event.target.value } })
                  }
                />
              </label>
              <label>
                项目入口
                <input
                  type="text"
                  maxLength={40}
                  placeholder={DEFAULT_PROJECT_LABEL}
                  value={projectLabel}
                  disabled={!installed}
                  onChange={(event) =>
                    dispatchDraft({ type: "patch", patch: { projectLabel: event.target.value } })
                  }
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
                  onChange={(event) =>
                    dispatchDraft({ type: "patch", patch: { statusText: event.target.value } })
                  }
                />
              </label>
            </div>
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
                    onChange={(event) =>
                      dispatchDraft({
                        type: "patch",
                        patch: { useCustomAccent: event.target.checked },
                      })
                    }
                  />
                  <span>自定义</span>
                </label>
                <input
                  className="accent-picker"
                  type="color"
                  value={accentColor}
                  disabled={!installed || !useCustomAccent}
                  aria-label="选择主题强调色"
                  onChange={(event) =>
                    dispatchDraft({ type: "patch", patch: { accentColor: event.target.value } })
                  }
                />
                <code>{useCustomAccent ? accentColor.toUpperCase() : "跟随图片"}</code>
              </span>
            </div>
            <button
              type="button"
              className="advanced-reset"
              disabled={!installed}
              onClick={() =>
                dispatchDraft({
                  type: "patch",
                  patch: {
                    ...DEFAULT_IMPORT_DRAFT,
                    themeName,
                  },
                })
              }
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
