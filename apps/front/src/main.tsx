import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import "./styles/global.css";
import "./styles/saas.css";
import "./styles/payments.css";
import "./styles/usability.css";
import { applyCachedThemeBeforePaint } from "./core/theme/themeScope";
import { startPwaInstallCapture } from "./pwa/pwaInstall";

// Tema de la última tienda antes del primer render (sin parpadeo arena → color de la tienda).
applyCachedThemeBeforePaint(window.location.pathname);
// "Instalar Trama": beforeinstallprompt puede llegar antes de que monte el botón.
startPwaInstallCapture(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
);