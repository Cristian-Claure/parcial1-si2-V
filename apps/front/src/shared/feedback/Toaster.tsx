import { useToastStore } from "./toastStore";

/** Región de avisos breves (aria-live) anclada abajo a la derecha. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  return <div className="toaster" aria-live="polite" aria-atomic="false">
    {toasts.map((item) => <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>
      <span>{item.message}</span>
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => dismiss(item.id)}>×</button>
    </div>)}
  </div>;
}
