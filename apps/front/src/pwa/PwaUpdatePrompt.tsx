import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onOfflineReady() {
      console.info("[VÉLORA PWA] application shell listo offline.");
    },
    onRegisterError(error) {
      console.error("[VÉLORA PWA] error de service worker.", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-banner" role="status">
      <p>Hay una nueva versión de VÉLORA disponible.</p>
      <div className="pwa-update-actions">
        <button type="button" className="button small primary" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </button>
        <button type="button" className="button small secondary" onClick={() => setNeedRefresh(false)}>
          Más tarde
        </button>
      </div>
    </div>
  );
}
