import { registerSW } from "virtual:pwa-register";

export function registerVeloraServiceWorker() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info("[VÉLORA PWA] application shell listo offline.");
    },
    onNeedRefresh() {
      console.info("[VÉLORA PWA] nueva versión disponible.");
    },
    onRegisterError(error) {
      console.error("[VÉLORA PWA] error de service worker.", error);
    }
  });
}