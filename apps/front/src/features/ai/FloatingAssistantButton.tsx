import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { veloraApi } from "../../core/api/veloraApi";

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

  if (user?.role !== "CUSTOMER" || !companyId) {
    return null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="assistant-fab"
        aria-label={open ? "Cerrar asistente VÉLORA" : "Abrir asistente VÉLORA"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "✕" : "IA"}
      </button>

      {open ? (
        <div className="assistant-overlay">
          <div
            className="assistant-overlay-card"
            role="dialog"
            aria-modal="false"
            aria-label="Asistente de productos VÉLORA"
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
