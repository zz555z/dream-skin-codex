export function InstallBanner({
  platform,
  installHint,
  busy,
  canInstall,
  onInstall,
  onRefresh,
}: {
  platform?: string;
  installHint?: string;
  busy: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="panel install-banner">
      <div>
        <p className="eyebrow">傻瓜式安装</p>
        <h2>一键安装 Dream Skin 引擎</h2>
        <p className="muted">
          {installHint || "会把引擎装到本机用户目录，不修改官方 Codex / ChatGPT 安装包。"}
        </p>
        <ul className="install-steps">
          {platform === "windows" ? (
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
        <button type="button" className="primary" disabled={busy || !canInstall} onClick={onInstall}>
          一键安装引擎
        </button>
        <button type="button" className="soft" disabled={busy} onClick={onRefresh}>
          重新检测
        </button>
      </div>
    </section>
  );
}
