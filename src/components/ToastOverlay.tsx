export function ToastOverlay({
  toast,
}: {
  toast: { message: string; kind: "ok" | "err" };
}) {
  return (
    <div className={`result-overlay ${toast.kind}`} role="status" aria-live="polite">
      <div className={`result-card ${toast.kind}`}>
        <div className="result-icon" aria-hidden>
          {toast.kind === "ok" ? "✓" : "!"}
        </div>
        <strong>{toast.kind === "ok" ? "完成" : "失败"}</strong>
        <p>{toast.message}</p>
      </div>
    </div>
  );
}
