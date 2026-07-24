import type { Dispatch, DragEvent, Ref, RefObject } from "react";
import type { ImportDraft, ImportDraftAction } from "../lib/importDraft";

export type SelectedImage =
  | { source: "file"; file: File; name: string; size: number }
  | { source: "path"; path: string; name: string; size?: number };

export function ImportPanel({
  installed,
  busy,
  selectedImage,
  previewUrl,
  dragOver,
  draft,
  dispatchDraft,
  dropzoneRef,
  advancedOpen,
  onOpenAdvanced,
  onAcceptFile,
  onClearImage,
  onApply,
  onSaveLibrary,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  installed: boolean;
  busy: boolean;
  selectedImage: SelectedImage | null;
  previewUrl: string | null;
  dragOver: boolean;
  draft: ImportDraft;
  dispatchDraft: Dispatch<ImportDraftAction>;
  dropzoneRef: RefObject<HTMLLabelElement | null>;
  advancedOpen: boolean;
  onOpenAdvanced: () => void;
  onAcceptFile: (file: File) => void;
  onClearImage: () => void;
  onApply: () => void;
  onSaveLibrary: () => void;
  onDragEnter: (event: DragEvent<HTMLLabelElement>) => void;
  onDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: (event: DragEvent<HTMLLabelElement>) => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
}) {
  const { themeName, appearance, safeArea, taskMode } = draft;
  return (
    <section className={`panel import${installed ? "" : " is-disabled"}`}>
      <label
        ref={dropzoneRef as Ref<HTMLLabelElement>}
        className={`dropzone${dragOver ? " drag" : ""}${previewUrl ? " has-preview" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="image/*,.heic,.tif,.tiff"
          hidden
          disabled={!installed}
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            if (!file) {
              onClearImage();
              return;
            }
            onAcceptFile(file);
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
            onChange={(event) =>
              dispatchDraft({ type: "setThemeName", value: event.target.value })
            }
          />
        </label>
        <label>
          外观
          <select
            value={appearance}
            disabled={!installed}
            onChange={(event) =>
              dispatchDraft({ type: "patch", patch: { appearance: event.target.value } })
            }
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
            onChange={(event) =>
              dispatchDraft({ type: "patch", patch: { safeArea: event.target.value } })
            }
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
            onChange={(event) =>
              dispatchDraft({ type: "patch", patch: { taskMode: event.target.value } })
            }
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
          onClick={onOpenAdvanced}
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
          onClick={onApply}
        >
          应用已选图片
        </button>
        <button
          type="button"
          className="library-btn"
          disabled={busy || !installed || !selectedImage}
          onClick={onSaveLibrary}
        >
          添加到主题库
        </button>
      </div>
    </section>
  );
}
