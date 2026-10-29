import { formatMoney, labelFor, PAYMENT_STATUS_LABELS, type QrCharge } from "@velora/contracts";
import { useEffect, useState } from "react";
import { Notice } from "../../shared/feedback/Notice";
import { formatCountdown, secondsUntil, statusPillClass } from "./paymentFormat";

function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [active]);
  return now;
}

/**
 * QR de pago (pedidos y planes): imagen, referencia, monto del servidor, cuenta regresiva y estado.
 * En DEMO muestra un aviso visible y el enlace al "Banco demo" para simular el pago.
 */
export function QrPaymentPanel({ qr, concept, onRetry }: { qr: QrCharge; concept: string; onRetry?: (() => void) | undefined }) {
  const pending = qr.status === "PENDING";
  const now = useNow(pending);
  const remaining = secondsUntil(qr.expiresAt, now, qr.secondsRemaining);
  const image = qr.qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.qrSvg)}` : qr.qrPngDataUrl;
  return <section className="qr-panel" aria-live="polite">
    {qr.demo ? <div className="qr-demo-banner" role="note"><strong>Modo demostración.</strong> Este QR no mueve dinero real: escanéalo o ábrelo en el Banco demo para simular el pago.</div> : null}
    <div className="qr-panel-body">
      {pending && image ? <figure className="qr-figure"><img src={image} alt={`Código QR para pagar ${formatMoney(qr.amount, qr.currency)}`} width={220} height={220} /></figure> : null}
      <div className="qr-details">
        <span className={statusPillClass(qr.status)}>{labelFor(PAYMENT_STATUS_LABELS, qr.status)}</span>
        <h3>{concept}</h3>
        <p className="qr-amount">{formatMoney(qr.amount, qr.currency)}</p>
        <dl className="summary-list">
          <dt>Referencia</dt><dd className="mono">{qr.reference}</dd>
          {pending ? <><dt>Vence en</dt><dd className={remaining <= 60 ? "qr-countdown urgent" : "qr-countdown"}>{formatCountdown(remaining)}</dd></> : null}
        </dl>
        {pending && remaining > 0 ? <p className="field-hint">Esperando el pago… la pantalla se actualiza sola.</p> : null}
        {pending && qr.payUrl ? <a className="button secondary" href={qr.payUrl} target="_blank" rel="noreferrer">Abrir el Banco demo</a> : null}
        {qr.status === "PAID" ? <Notice kind="success">Pago confirmado.</Notice> : null}
        {(qr.status === "EXPIRED" || (pending && remaining === 0)) ? <Notice kind="warning">El QR venció (10 minutos). Genera uno nuevo para pagar.</Notice> : null}
        {qr.status === "CANCELLED" || qr.status === "FAILED" ? <Notice kind="error">El pago no se completó.</Notice> : null}
        {onRetry && qr.status !== "PAID" && (!pending || remaining === 0) ? <button type="button" className="button primary" onClick={onRetry}>Generar un QR nuevo</button> : null}
      </div>
    </div>
  </section>;
}
