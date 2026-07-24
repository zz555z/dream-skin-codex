export function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="busy-overlay" role="alert" aria-live="assertive">
      <div className="busy-card">
        <div className="busy-spinner" aria-hidden />
        <strong>{label}</strong>
        <p>换肤过程可能需要 1–2 分钟（尤其是首次重启 Codex），请稍候，不要关闭应用</p>
      </div>
    </div>
  );
}
