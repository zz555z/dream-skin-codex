import { useCallback, useEffect, useState } from "react";
import type { ConfirmDialogState, ConfirmStep } from "../components/ConfirmDialog";

export function useConfirmDialog() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const openConfirmDialog = useCallback(
    (options: { steps: ConfirmStep[]; danger?: boolean; onConfirm: () => void }) => {
      setConfirmDialog({
        steps: options.steps,
        stepIndex: 0,
        danger: options.danger,
        onConfirm: options.onConfirm,
      });
    },
    [],
  );

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);

  const advanceConfirmDialog = useCallback(() => {
    setConfirmDialog((current) => {
      if (!current) return null;
      if (current.stepIndex < current.steps.length - 1) {
        return { ...current, stepIndex: current.stepIndex + 1 };
      }
      const action = current.onConfirm;
      // Clear dialog first, then run the confirmed action.
      setTimeout(() => action(), 0);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!confirmDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setConfirmDialog(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirmDialog]);

  return {
    confirmDialog,
    openConfirmDialog,
    closeConfirmDialog,
    advanceConfirmDialog,
  };
}
