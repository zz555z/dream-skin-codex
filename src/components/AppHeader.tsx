export function AppHeader({
  platform,
  busy,
  canInstall,
  installed,
  liveClass,
  liveText,
  onTitleClick,
  onCopyPrompt,
  onRefresh,
  onReinstall,
  onRestore,
}: {
  platform?: string;
  busy: boolean;
  canInstall: boolean;
  installed: boolean;
  liveClass: string;
  liveText: string;
  onTitleClick: () => void;
  onCopyPrompt: () => void;
  onRefresh: () => void;
  onReinstall: () => void;
  onRestore: () => void;
}) {
  return (
    <header className="top" data-tauri-drag-region>
      <div className="brand">
        <div>
          <p className="eyebrow">Codex Desktop · Local CDP · {platform || "…"}</p>
          <h1 onClick={onTitleClick}>Dream Skin 换肤台</h1>
        </div>
      </div>
      <div className="top-actions">
        <button
          type="button"
          className="ghost"
          title="复制 Codex Dream Skin 中文纯背景生图提示词"
          onClick={onCopyPrompt}
        >
          复制生图提示词
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={onRefresh}>
          刷新状态
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy || !canInstall}
          title="用应用内置资源重装注入器 / 引擎（请先完全退出 Codex）"
          onClick={onReinstall}
        >
          重新安装注入器
        </button>
        <button type="button" className="danger" disabled={busy || !installed} onClick={onRestore}>
          恢复官方
        </button>
        <span className={`live-pill ${liveClass}`}>{liveText}</span>
      </div>
    </header>
  );
}
