import { useEffect, useRef, useState } from "react";

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

/**
 * Confirmación de acciones (destructivas o no). Se cierra con Escape o tocando fuera, enfoca
 * "Volver" al abrir, bloquea el doble clic mientras trabaja y muestra el error sin cerrarse.
 */
export function ConfirmDialog({ state, onClose }: { state: ConfirmDialogState | null; onClose: () => void }) {
  return state ? <ConfirmDialogBody state={state} onClose={onClose} /> : null;
}

/** Se monta solo con un diálogo abierto: busy y error empiezan limpios en cada apertura. */
function ConfirmDialogBody({ state, onClose }: { state: ConfirmDialogState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // onClose suele llegar como función inline: se lee por ref para no reiniciar el diálogo en cada render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {

    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [state]);

  const confirm = async () => {
    setBusy(true); setError(null);
    try { await state.onConfirm(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la acción."); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <span className="eyebrow">CONFIRMACIÓN</span>
        <h2 id="confirm-title">{state.title}</h2>
        <p id="confirm-message">{state.message}</p>
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
        <div className="actions">
          <button ref={cancelRef} type="button" className="button secondary" onClick={onClose} disabled={busy}>Volver</button>
          <button type="button" className={state.destructive ? "button danger" : "button primary"} onClick={() => void confirm()} disabled={busy}>
            {busy ? "Procesando…" : state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
