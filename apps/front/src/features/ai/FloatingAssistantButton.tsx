import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { veloraApi } from "../../core/api/veloraApi";

import { useLocation } from "react-router-dom";
import { webArea } from "@velora/contracts";
import { useStorefrontBrand } from "../../core/company/useBrand";
import { ProductAssistantPanel } from "./ProductAssistantPanel";

export function FloatingAssistantButton() {
  const [open, setOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const user = useAuthStore((state) => state.user);
  const companyId = useCompanyStore((state) => state.storefrontCompanyId);

  const productsQuery = useQuery({
    queryKey: ["public-products", companyId],
    queryFn: () => veloraApi.publicProducts(companyId!),
    enabled: Boolean(open && companyId),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const location = useLocation(); const brand = useStorefrontBrand();
  // Solo dentro de una tienda (/t/…, catálogo y área del cliente); nunca en pantallas de la plataforma.
  const inStore = location.pathname.startsWith("/t/") || location.pathname.startsWith("/catalogo") || webArea(location.pathname) === "customer";

  if (user?.role !== "CUSTOMER" || !companyId || !inStore) {
    return null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="assistant-fab"
        aria-label={open ? "Cerrar asistente de la tienda" : "Abrir asistente de la tienda"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <span className="assistant-fab-close">✕</span>
        ) : (
          brand?.logoUrl ? <img className="assistant-fab-mark" src={brand.logoUrl} alt="" /> : <span className="assistant-fab-initial" aria-hidden="true">{(brand?.name ?? "?").slice(0, 1).toUpperCase()}</span>
        )}
      </button>

      {open ? (
        <div className="assistant-overlay">
          <div
            className="assistant-overlay-card"
            role="dialog"
            aria-modal="false"
            aria-label="Asistente de productos de la tienda"
          >
            <button
              ref={closeRef}
              type="button"
              className="assistant-overlay-close"
              aria-label="Cerrar asistente"
              onClick={close}
            >
              ✕
            </button>
            <ProductAssistantPanel
              companyId={companyId}
              products={productsQuery.data ?? []}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
