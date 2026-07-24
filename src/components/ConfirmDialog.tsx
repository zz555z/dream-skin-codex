export type ConfirmStep = {
  title: string;
  body: string;
  confirmLabel?: string;
};

export type ConfirmDialogState = {
  steps: ConfirmStep[];
  stepIndex: number;
  danger?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  dialog,
  onClose,
  onAdvance,
}: {
  dialog: ConfirmDialogState;
  onClose: () => void;
  onAdvance: () => void;
}) {
  const step = dialog.steps[dialog.stepIndex];
  return (
    <div className="confirm-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`confirm-modal${dialog.danger ? " is-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div>
            <p className="confirm-kicker">
              {dialog.steps.length > 1
                ? `确认 ${dialog.stepIndex + 1}/${dialog.steps.length}`
                : "请确认"}
            </p>
            <strong id="confirm-dialog-title">{step?.title}</strong>
          </div>
          <button
            type="button"
            className="advanced-modal-close"
            aria-label="关闭确认"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="confirm-modal-body">{step?.body}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="soft" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={dialog.danger ? "danger" : "primary"}
            onClick={onAdvance}
          >
            {step?.confirmLabel ||
              (dialog.stepIndex < dialog.steps.length - 1 ? "继续" : "确认")}
          </button>
        </div>
      </div>
    </div>
  );
}
