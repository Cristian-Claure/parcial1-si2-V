export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

export function ConfirmDialog(
  {
    state,
    onClose,
  }: {
    state: ConfirmDialogState | null;
    onClose: () => void;
  },
) {
  if (!state) {
    return null;
  }

  const confirm = async () => {
    await state.onConfirm();
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.currentTarget ===
          event.target
        ) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <span className="eyebrow">
          CONFIRMACIÓN
        </span>
        <h2 id="confirm-title">
          {state.title}
        </h2>
        <p>{state.message}</p>
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
          >
            Volver
          </button>
          <button
            type="button"
            className={
              state.destructive
                ? "button danger"
                : "button primary"
            }
            onClick={() => void confirm()}
          >
            {state.confirmLabel ??
              "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
