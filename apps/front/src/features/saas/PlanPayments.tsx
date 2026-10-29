import { formatDateTime, formatMoney, labelFor, PAYMENT_STATUS_LABELS, type Plan, type PlanPayment, type PlanPaymentMethod, type PlanPaymentResponse, type PlatformBillingSettingsResponse } from "@velora/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiBaseUrl } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";
import { QrPaymentPanel } from "../payments/QrPaymentPanel";
import { openProtectedFile, planPaymentMethodLabel, statusPillClass } from "../payments/paymentFormat";
import { PlanErrorNotice } from "./PlanErrorNotice";
import { priceLabel } from "./planCopy";

const METHOD_HINT: Record<PlanPaymentMethod, string> = {
  STRIPE: "Pago con tarjeta en la página segura de Stripe.",
  QR: "Escanea el QR desde la app de tu banco; vence en 10 minutos.",
  TRANSFER: "Transfiere a la cuenta de la plataforma y sube el comprobante; lo revisamos y activamos tu plan.",
};

/** Paso "método de pago" de Mi plan → mejorar o renovar. */
export function PlanPaymentFlow({ plan, onCancel, onStarted }: { plan: Plan; onCancel: () => void; onStarted: (paymentId: string) => void }) {
  const options = useQuery({ queryKey: ["plan-payment-options"], queryFn: veloraApi.planPaymentOptions });
  const [method, setMethod] = useState<PlanPaymentMethod | null>(null);
  const create = useMutation({
    mutationFn: (selected: PlanPaymentMethod) => veloraApi.createPlanPayment({ planCode: plan.code as "PLUS" | "MAX", method: selected }),
    onSuccess: (result) => {
      if (result.checkoutUrl) { globalThis.location.assign(result.checkoutUrl); return; }
      onStarted(result.payment.id);
    },
  });
  const chosen = method ?? options.data?.methods.find((option) => option.enabled)?.method ?? null;
  return <div className="panel">
    <h2>Pagar {plan.name} · {priceLabel(plan)} / 30 días</h2>
    <p className="field-hint">El plan se activa cuando el pago se confirma. Si renuevas tu plan vigente, los 30 días se suman a tu vencimiento.</p>
    <div className="choice-row payment-methods" role="radiogroup" aria-label="Método de pago">
      {options.data?.methods.map((option) => <label key={option.method} className={[`choice-card`, chosen === option.method ? "selected" : "", option.enabled ? "" : "disabled"].join(" ").trim()}>
        <input type="radio" name="plan-method" disabled={!option.enabled} checked={chosen === option.method} onChange={() => setMethod(option.method)} />
        <span className="choice-card-title">{option.label}</span>
        <small>{option.enabled ? METHOD_HINT[option.method] : option.reason}</small>
      </label>)}
    </div>
    {options.isError ? <Notice kind="error">No se pudieron cargar los métodos de pago.</Notice> : null}
    <PlanErrorNotice error={create.error} upgradeTo={null} />
    <div className="actions">
      <button type="button" className="button secondary" onClick={onCancel}>Volver</button>
      <button type="button" className="button primary" disabled={!chosen || create.isPending} onClick={() => chosen && create.mutate(chosen)}>{create.isPending ? "Preparando el pago…" : chosen === "STRIPE" ? "Ir a pagar con tarjeta" : "Continuar"}</button>
    </div>
  </div>;
}

function TransferInstructions({ settings, payment }: { settings: PlatformBillingSettingsResponse; payment: PlanPayment }) {
  return <div className="transfer-box">
    {settings.isSample ? <Notice kind="warning">Datos de ejemplo de la plataforma: no transfieras dinero real.</Notice> : null}
    <dl className="summary-list">
      <dt>Banco</dt><dd>{settings.bankName}</dd>
      <dt>Titular</dt><dd>{settings.accountHolder}</dd>
      <dt>Cuenta</dt><dd>{settings.accountType && settings.accountType !== "No especificado" ? `${settings.accountType} · ` : ""}<span className="mono">{settings.accountNumber}</span></dd>
      {settings.taxId ? <><dt>NIT/CI</dt><dd>{settings.taxId}</dd></> : null}
      <dt>Monto exacto</dt><dd>{formatMoney(payment.amount, payment.currency)}</dd>
      <dt>Glosa / referencia</dt><dd className="mono">{payment.reference}</dd>
    </dl>
    {settings.qrImageUrl ? <>
      <figure className="qr-figure"><img src={`${apiBaseUrl}${settings.qrImageUrl}`} alt={`QR de la cuenta ${settings.bankName}`} width={220} height={220} /></figure>
      <Notice kind="warning">Este QR no trae monto. Ingresa exactamente {formatMoney(payment.amount, payment.currency)} y escribe la referencia <strong className="mono">{payment.reference}</strong> en la glosa.</Notice>
    </> : <Notice>Ingresa exactamente {formatMoney(payment.amount, payment.currency)} y escribe la referencia <strong className="mono">{payment.reference}</strong> en la glosa.</Notice>}
    {settings.instructions ? <p className="field-hint">{settings.instructions}</p> : null}
  </div>;
}

function ProofForm({ paymentId, onSent }: { paymentId: string; onSent: (result: PlanPaymentResponse) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState("");
  const upload = useMutation({ mutationFn: () => veloraApi.uploadTransferProof(paymentId, file!, operation.trim()), onSuccess: onSent });
  const submit = (event: FormEvent) => { event.preventDefault(); if (file && operation.trim().length >= 3) upload.mutate(); };
  return <form className="form-grid" onSubmit={submit}>
    <label>Número de operación<input value={operation} onChange={(event) => setOperation(event.target.value)} required minLength={3} maxLength={60} /></label>
    <label>Comprobante (imagen o PDF, máx. 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
    {upload.isError ? <div className="span-2"><Notice kind="error">{upload.error instanceof Error ? upload.error.message : "No se pudo enviar el comprobante."}</Notice></div> : null}
    <div className="actions span-2"><button type="submit" className="button primary" disabled={!file || operation.trim().length < 3 || upload.isPending}>{upload.isPending ? "Enviando…" : "Enviar comprobante"}</button></div>
  </form>;
}

/** Resultado del pago: QR con cuenta regresiva, instrucciones de transferencia o estado de Stripe. */
export function PlanPaymentResult({ paymentId, onClose, onRetry }: { paymentId: string; onClose: () => void; onRetry: (planCode: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["plan-payment", paymentId],
    queryFn: async () => {
      const result = await veloraApi.planPayment(paymentId);
      if (result.payment.status === "PAID") { await client.invalidateQueries({ queryKey: ["admin-plan"] }); await client.invalidateQueries({ queryKey: ["admin-reports"] }); }
      await client.invalidateQueries({ queryKey: ["plan-payments"] });
      return result;
    },
    refetchInterval: (state) => {
      const status = state.state.data?.payment.status;
      if (status === "PENDING") return 3000;
      if (status === "PENDING_REVIEW") return 15000;
      return false;
    },
  });
  const cancel = useMutation({ mutationFn: () => veloraApi.cancelPlanPayment(paymentId), onSuccess: (result) => client.setQueryData(["plan-payment", paymentId], result) });
  const data = query.data;
  if (!data) return <div className="panel">{query.isError ? <Notice kind="error">No se pudo consultar el pago.</Notice> : <p>Consultando el pago…</p>}</div>;
  const { payment } = data;
  return <div className="panel">
    <div className="page-heading row"><div><span className="eyebrow">PAGO DEL PLAN</span><h2>{payment.planName} · {planPaymentMethodLabel(payment)}</h2></div><span className={statusPillClass(payment.status)}>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</span></div>
    {payment.status === "PAID" ? <Notice kind="success">¡Pago confirmado! Tu plan {payment.planName} está activo por 30 días.</Notice> : null}
    {data.qr ? <QrPaymentPanel qr={data.qr} concept={`Plan ${payment.planName} · 30 días`} onRetry={() => onRetry(payment.planCode)} /> : null}
    {payment.method === "WEB" && payment.status === "PENDING" ? <Notice>Esperando la confirmación de Stripe. Si cerraste la página de pago, puedes cancelar este intento y elegir otro método.</Notice> : null}
    {data.transfer && (payment.status === "PENDING" || payment.status === "PENDING_REVIEW") ? <TransferInstructions settings={data.transfer} payment={payment} /> : null}
    {payment.rejectionReason ? <Notice kind="error">Tu comprobante fue rechazado: {payment.rejectionReason}. Corrige y vuelve a enviarlo.</Notice> : null}
    {payment.method === "TRANSFER" && payment.status === "PENDING" ? <ProofForm paymentId={payment.id} onSent={(result) => client.setQueryData(["plan-payment", paymentId], result)} /> : null}
    {payment.status === "PENDING_REVIEW" ? <Notice>Comprobante recibido. La plataforma lo revisará y activará tu plan al aprobarlo.</Notice> : null}
    {payment.status === "EXPIRED" || payment.status === "CANCELLED" || payment.status === "FAILED" ? <Notice kind="warning">Este intento de pago no se completó. Puedes intentarlo de nuevo con cualquier método.</Notice> : null}
    <div className="actions">
      {payment.status === "PENDING" ? <button type="button" className="button secondary danger-outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar este pago</button> : null}
      {payment.receiptAvailable ? <button type="button" className="button secondary" onClick={() => void openProtectedFile(() => veloraApi.planReceipt(payment.id))}>Descargar comprobante (PDF)</button> : null}
      {payment.status !== "PENDING" && payment.status !== "PENDING_REVIEW" && payment.status !== "PAID" ? <button type="button" className="button primary" onClick={() => onRetry(payment.planCode)}>Elegir otro método</button> : null}
      <button type="button" className="button secondary" onClick={onClose}>Cerrar</button>
    </div>
  </div>;
}

/** Historial de pagos del plan con acceso al PDF (PAID) y al comprobante enviado. */
export function PlanPaymentHistory({ onOpen }: { onOpen: (paymentId: string) => void }) {
  const history = useQuery({ queryKey: ["plan-payments"], queryFn: veloraApi.planPayments });
  if (!history.data?.length) return null;
  return <div className="panel"><h2>Historial de pagos</h2><div className="table-wrap"><table className="data-table">
    <thead><tr><th>Fecha</th><th>Plan</th><th>Método</th><th>Monto</th><th>Estado</th><th>Referencia</th><th><span className="sr-only">Acciones</span></th></tr></thead>
    <tbody>{history.data.map((payment) => <tr key={payment.id}>
      <td>{formatDateTime(payment.paidAt ?? payment.createdAt)}</td><td>{payment.planName}</td><td>{planPaymentMethodLabel(payment)}</td>
      <td>{formatMoney(payment.amount, payment.currency)}</td><td><span className={statusPillClass(payment.status)}>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</span></td>
      <td className="mono">{payment.reference ?? "—"}</td>
      <td className="actions">
        {payment.receiptAvailable ? <button type="button" className="text-button" onClick={() => void openProtectedFile(() => veloraApi.planReceipt(payment.id))}>PDF</button> : null}
        {payment.proofs.length ? <button type="button" className="text-button" onClick={() => void openProtectedFile(() => veloraApi.paymentProof(payment.id))}>Comprobante</button> : null}
        {payment.status === "PENDING" || payment.status === "PENDING_REVIEW" ? <button type="button" className="text-button" onClick={() => onOpen(payment.id)}>Continuar</button> : null}
      </td>
    </tr>)}</tbody>
  </table></div></div>;
}
