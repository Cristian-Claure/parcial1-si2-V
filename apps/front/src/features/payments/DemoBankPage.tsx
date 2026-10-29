import { formatMoney, type QrActionResponse } from "@velora/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";
import { PageLoader } from "../../shared/ui/PageLoader";
import { formatCountdown, secondsUntil } from "./paymentFormat";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 410) return "Este QR venció. Vuelve a la tienda y genera uno nuevo.";
    if (error.status === 403) return "El enlace de pago no es válido.";
    if (error.status === 429) return "Demasiados intentos. Espera unos minutos.";
    return error.message;
  }
  return "No fue posible procesar el pago.";
}

/** "Banco demo" (público): simula la app del banco que lee el QR firmado. No mueve dinero real. */
export function DemoBankPage() {
  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [result, setResult] = useState<QrActionResponse | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const charge = useQuery({ queryKey: ["demo-bank", reference, token], queryFn: () => veloraApi.publicQr(reference, token), retry: false, enabled: token.length > 0 });
  const act = useMutation({ mutationFn: (action: "confirm" | "cancel") => veloraApi.publicQrAction(reference, token, action), onSuccess: setResult });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (charge.isLoading) return <section className="page demo-bank"><PageLoader /></section>;
  const data = charge.data;
  const remaining = data ? secondsUntil(data.expiresAt, now, data.secondsRemaining) : 0;
  const finalStatus = result?.status ?? data?.status;
  return <section className="page demo-bank">
    <div className="demo-bank-card panel">
      <div className="qr-demo-banner" role="note"><strong>Banco demo · modo demostración.</strong> Esta pantalla simula la app de un banco: no se cobra dinero real.</div>
      <span className="eyebrow">PAGO CON QR</span>
      {!token ? <Notice kind="error">El enlace de pago no es válido.</Notice> : null}
      {charge.isError ? <Notice kind="error">{errorMessage(charge.error)}</Notice> : null}
      {data ? <>
        <h1>{data.merchantName}</h1>
        <p className="field-hint">{data.concept}</p>
        <p className="qr-amount">{formatMoney(data.amount, data.currency)}</p>
        <dl className="summary-list">
          <dt>Referencia</dt><dd className="mono">{data.reference}</dd>
          {finalStatus === "PENDING" ? <><dt>Vence en</dt><dd className={remaining <= 60 ? "qr-countdown urgent" : "qr-countdown"}>{formatCountdown(remaining)}</dd></> : null}
        </dl>
        {finalStatus === "PAID" ? <Notice kind="success">Pago realizado{result?.alreadyProcessed ? " (ya estaba confirmado)" : ""}. Ya puedes volver a la tienda.</Notice> : null}
        {finalStatus === "CANCELLED" ? <Notice kind="warning">Pago cancelado. La tienda verá el intento como cancelado.</Notice> : null}
        {act.isError ? <Notice kind="error">{errorMessage(act.error)}</Notice> : null}
        {finalStatus === "PENDING" && remaining > 0 ? <div className="actions demo-bank-actions">
          <button type="button" className="button secondary" disabled={act.isPending} onClick={() => act.mutate("cancel")}>Cancelar</button>
          <button type="button" className="button primary" disabled={act.isPending} onClick={() => act.mutate("confirm")}>{act.isPending ? "Procesando…" : `Pagar ${formatMoney(data.amount, data.currency)}`}</button>
        </div> : null}
        {finalStatus === "PENDING" && remaining === 0 ? <Notice kind="warning">Este QR venció. Vuelve a la tienda y genera uno nuevo.</Notice> : null}
      </> : null}
    </div>
  </section>;
}
