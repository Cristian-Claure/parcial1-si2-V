import { useEffect, useRef, useState } from "react";
import { usePwaInstall } from "./usePwaInstall";

/**
 * "Instalar Trama". Chrome/Edge/Android: abre el diálogo nativo. iOS Safari: explica los pasos de
 * Compartir. No se muestra si la app ya está instalada ni donde el navegador no permite instalarla.
 * `variant="nav"` es la fila del menú lateral; el resto usa los botones de los encabezados.
 */
export function InstallAppButton({ variant = "secondary", className = "" }: { variant?: "primary" | "secondary" | "nav"; className?: string }) {
  const { canInstall, needsIosSteps, install } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);
  if (!canInstall && !needsIosSteps) return null;
  const onClick = () => { if (canInstall) void install(); else setIosOpen(true); };
  const classes = variant === "nav" ? "nav-button install-app-nav" : `button small ${variant} install-app-button`;
  return <>
    <button type="button" className={`${classes} ${className}`.trim()} onClick={onClick} aria-haspopup={canInstall ? undefined : "dialog"}>
      <svg className="install-app-icon" aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Instalar Trama
    </button>
    {iosOpen ? <IosInstallDialog onClose={() => setIosOpen(false)} /> : null}
  </>;
}

function IosInstallDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="modal-card install-ios" role="dialog" aria-modal="true" aria-labelledby="install-ios-title" aria-describedby="install-ios-steps">
      <span className="eyebrow">INSTALAR</span>
      <h2 id="install-ios-title">Instala Trama en tu iPhone o iPad</h2>
      <ol id="install-ios-steps">
        <li>Toca <strong>Compartir</strong> <span aria-hidden="true">(el cuadrado con la flecha hacia arriba)</span> en la barra de Safari.</li>
        <li>Elige <strong>Añadir a pantalla de inicio</strong>.</li>
        <li>Confirma con <strong>Añadir</strong>: Trama se abrirá como una app.</li>
      </ol>
      <div className="actions"><button ref={closeRef} type="button" className="button primary" onClick={onClose}>Entendido</button></div>
    </div>
  </div>;
}
