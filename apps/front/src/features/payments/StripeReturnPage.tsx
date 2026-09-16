import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_MS = 60000;

const SETTLED_STATUSES = new Set(["PAID", "FAILED", "CANCELLED", "REFUNDED"]);

export function StripeReturnPage() {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const payment = useQuery({
    queryKey: ["stripe-return-payment", paymentId],
    queryFn: () => veloraApi.payment(paymentId!),
    enabled: paymentId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && SETTLED_STATUSES.has(status)) return false;
      return Date.now() - startedAt < MAX_POLL_MS ? POLL_INTERVAL_MS : false;
    },
  });

  useEffect(() => {
    if (!payment.data || !SETTLED_STATUSES.has(payment.data.status)) return;
    void client.invalidateQueries({ queryKey: ["orders"] });
    void client.invalidateQueries({ queryKey: ["payments"] });
  }, [payment.data, client]);

  useEffect(() => {
    const remaining = Math.max(MAX_POLL_MS - (Date.now() - startedAt), 0);
    const timer = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  const stillPolling = (!payment.data || payment.data.status === "PENDING") && !timedOut;

  return (
    <section className="page centered">
      <span className="eyebrow">STRIPE</span>
      <h1>
        {paymentId === null
          ? "No se pudo identificar el pago"
          : payment.data?.status === "PAID"
            ? "Pago confirmado"
            : payment.data?.status === "FAILED"
              ? "El pago no pudo procesarse"
              : payment.data?.status === "CANCELLED"
                ? "Pago cancelado"
                : payment.data?.status === "REFUNDED"
                  ? "Pago reembolsado"
                  : "Estamos validando su pago"}
      </h1>

      {paymentId === null ? (
        <Notice kind="error">
          El enlace de retorno de Stripe no incluyó una referencia de pago válida. Revise el estado desde Mis pedidos.
        </Notice>
      ) : payment.isError ? (
        <Notice kind="error">No fue posible consultar el estado del pago. Intente nuevamente desde Mis pedidos.</Notice>
      ) : payment.data?.status === "PAID" ? (
        <Notice kind="success">Su pago fue confirmado por Stripe. El pedido ya refleja el pago.</Notice>
      ) : payment.data?.status === "FAILED" ? (
        <Notice kind="error">Stripe reportó que el pago falló. Puede intentar con otro método desde el pedido.</Notice>
      ) : payment.data?.status === "CANCELLED" ? (
        <Notice>El pago fue cancelado. El pedido continúa reservado para elegir otro método.</Notice>
      ) : payment.data?.status === "REFUNDED" ? (
        <Notice>El pago fue reembolsado.</Notice>
      ) : stillPolling ? (
        <Notice>La web no marca el pago como confirmado por sí sola. El estado definitivo llega mediante el webhook firmado de Stripe en NestJS.</Notice>
      ) : (
        <Notice kind="error">
          Stripe todavía no confirma este pago tras un minuto de espera. Verifique el estado desde Mis pedidos en unos instantes.
        </Notice>
      )}

      <Link className="button primary" to="/mis-pedidos">Ver mis pedidos</Link>
    </section>
  );
}
