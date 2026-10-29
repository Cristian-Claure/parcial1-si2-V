import { formatDateTime, formatMoney, labelFor, PAYMENT_STATUS_LABELS, type PaymentStatus, type PlatformBillingSettingsInput, type PlatformBillingSettingsResponse, type PlatformPayment } from "@velora/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiBaseUrl } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { EmptyState, Notice } from "../../shared/feedback/Notice";
import { PageLoader } from "../../shared/ui/PageLoader";
import { planPaymentMethodLabel, statusPillClass } from "../payments/paymentFormat";


/** /plataforma/cobros: datos de la cuenta que reciben las transferencias de planes. */
export function PlatformBillingSettingsPage() {
  const settings = useQuery({ queryKey: ["platform-billing-settings"], queryFn: veloraApi.platformBillingSettings });
  if (settings.isLoading) return <PageLoader />;
  if (!settings.data) return <section className="page"><Notice kind="error">No se pudieron cargar los datos de cobro.</Notice></section>;
  return <BillingSettingsForm key={settings.data.updatedAt} settings={settings.data} />;
}

function BillingSettingsForm({ settings: initial }: { settings: PlatformBillingSettingsResponse }) {
  const client = useQueryClient();
  const settings = { data: initial };
  const [form, setForm] = useState<PlatformBillingSettingsInput>(() => ({
    bankName: initial.bankName, accountHolder: initial.accountHolder, accountType: initial.accountType, accountNumber: initial.accountNumber, taxId: initial.taxId, instructions: initial.instructions,
  }));
  const [message, setMessage] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => veloraApi.updatePlatformBillingSettings(form), onSuccess: (data) => { client.setQueryData(["platform-billing-settings"], data); setMessage("Datos de cobro guardados."); } });
  const uploadQr = useMutation({ mutationFn: (file: File) => veloraApi.uploadPlatformBillingQr(file), onSuccess: (data) => { client.setQueryData(["platform-billing-settings"], data); setMessage("QR de la cuenta actualizado."); } });
  const removeQr = useMutation({ mutationFn: veloraApi.removePlatformBillingQr, onSuccess: (data) => { client.setQueryData(["platform-billing-settings"], data); setMessage("QR de la cuenta eliminado."); } });
  const field = (key: keyof PlatformBillingSettingsInput) => ({
    value: form[key] ?? "",
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: key === "taxId" || key === "instructions" ? event.target.value || null : event.target.value }),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); setMessage(null); save.mutate(); };
  return <section className="page">
    <div className="page-heading"><span className="eyebrow">PLATAFORMA</span><h1>Datos de cobro</h1><p>Cuenta que reciben las transferencias de los planes. Se muestran al propietario junto con el monto y la glosa.</p></div>
    {settings.data?.isSample ? <Notice kind="warning">DATOS DE EJEMPLO: reemplázalos por la cuenta real antes de recibir transferencias.</Notice> : null}
    {message ? <Notice kind="success">{message}</Notice> : null}
    {save.isError ? <Notice kind="error">{save.error instanceof Error ? save.error.message : "No se pudo guardar."}</Notice> : null}
    <div className="two-columns">
      <form className="panel form-grid" onSubmit={submit}>
        <label>Banco<input {...field("bankName")} required minLength={2} maxLength={120} /></label>
        <label>Titular<input {...field("accountHolder")} required minLength={2} maxLength={160} /></label>
        <label>Tipo de cuenta<input {...field("accountType")} required minLength={2} maxLength={40} placeholder="Caja de ahorro" /></label>
        <label>Número de cuenta<input {...field("accountNumber")} required minLength={4} maxLength={40} inputMode="numeric" /></label>
        <label>NIT/CI (opcional)<input {...field("taxId")} maxLength={30} /></label>
        <label className="span-2">Instrucciones<textarea {...field("instructions")} maxLength={1000} rows={3} /></label>
        <div className="actions span-2"><button type="submit" className="button primary" disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar datos"}</button></div>
      </form>
      <div className="panel">
        <h2>QR estático de la cuenta (opcional)</h2>
        <p className="field-hint">Imagen PNG, JPG o WEBP de hasta 2 MB. Es pública: la verá quien vaya a transferir.</p>
        {settings.data?.qrImageUrl ? <figure className="qr-figure"><img src={`${apiBaseUrl}${settings.data.qrImageUrl}`} alt="QR de la cuenta" width={200} height={200} /></figure> : <p className="field-hint">Sin imagen.</p>}
        <div className="actions">
          <label className="button secondary">Subir imagen<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadQr.mutate(file); }} /></label>
          {settings.data?.qrImageUrl ? <button type="button" className="button secondary danger-outline" onClick={() => removeQr.mutate()}>Quitar</button> : null}
        </div>
        {uploadQr.isError ? <Notice kind="error">{uploadQr.error instanceof Error ? uploadQr.error.message : "No se pudo subir la imagen."}</Notice> : null}
        {settings.data ? <p className="field-hint">Actualizado: {formatDateTime(settings.data.updatedAt)}</p> : null}
      </div>
    </div>
  </section>;
}

function ProofPreview({ payment }: { payment: PlatformPayment }) {
  const latest = payment.proofs[0];
  const preview = useQuery({
    queryKey: ["payment-proof", payment.id, latest?.id],
    enabled: Boolean(latest),
    queryFn: async () => URL.createObjectURL(await veloraApi.paymentProof(payment.id, latest!.id)),
    staleTime: Infinity,
  });
  useEffect(() => () => { if (preview.data) URL.revokeObjectURL(preview.data); }, [preview.data]);
  if (!latest) return <p className="field-hint">Sin comprobante.</p>;
  return <div className="proof-preview">
    <p className="field-hint">Operación <strong className="mono">{latest.operationNumber}</strong> · enviado {formatDateTime(latest.submittedAt)}</p>
    {preview.data ? (latest.contentType === "application/pdf"
      ? <object data={preview.data} type="application/pdf" aria-label="Comprobante PDF"><a href={preview.data} target="_blank" rel="noreferrer">Abrir el PDF</a></object>
      : <img src={preview.data} alt={`Comprobante de ${payment.ownerName}`} />) : preview.isError ? <Notice kind="error">No se pudo cargar el comprobante.</Notice> : <p>Cargando comprobante…</p>}
  </div>;
}

function ReviewCard({ payment }: { payment: PlatformPayment }) {
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const review = useMutation({
    mutationFn: (decision: "APPROVE" | "REJECT") => veloraApi.reviewPlatformPayment(payment.id, { decision, reason: decision === "REJECT" ? reason.trim() : null }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["platform-payments"] }),
  });
  return <article className="panel review-card">
    <header className="order-header">
      <div><span className={statusPillClass(payment.status)}>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</span><h2>{payment.ownerName}</h2><p className="field-hint">{payment.ownerEmail}</p></div>
      <div className="order-amount"><strong>{formatMoney(payment.amount, payment.currency)}</strong><small>Plan {payment.planName} · {planPaymentMethodLabel(payment)}</small></div>
    </header>
    <dl className="summary-list"><dt>Referencia</dt><dd className="mono">{payment.reference ?? "—"}</dd><dt>Creado</dt><dd>{formatDateTime(payment.createdAt)}</dd>{payment.paidAt ? <><dt>Pagado</dt><dd>{formatDateTime(payment.paidAt)}</dd></> : null}</dl>
    {payment.method === "TRANSFER" ? <ProofPreview payment={payment} /> : null}
    {payment.proofs.filter((proof) => proof.decision === "REJECTED").map((proof) => <p key={proof.id} className="field-hint">Rechazado {proof.reviewedAt ? formatDateTime(proof.reviewedAt) : ""}: {proof.rejectionReason}</p>)}
    {review.isError ? <Notice kind="error">{review.error instanceof Error ? review.error.message : "No se pudo registrar la revisión."}</Notice> : null}
    {payment.status === "PENDING_REVIEW" ? <>
      {rejecting ? <label>Motivo del rechazo (lo verá el propietario)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} /></label> : null}
      <div className="actions">
        {rejecting
          ? <><button type="button" className="button secondary" onClick={() => setRejecting(false)}>Volver</button><button type="button" className="button secondary danger-outline" disabled={reason.trim().length < 5 || review.isPending} onClick={() => review.mutate("REJECT")}>Confirmar rechazo</button></>
          : <><button type="button" className="button secondary danger-outline" onClick={() => setRejecting(true)}>Rechazar</button><button type="button" className="button primary" disabled={review.isPending} onClick={() => review.mutate("APPROVE")}>{review.isPending ? "Aprobando…" : "Aprobar y activar plan"}</button></>}
      </div>
    </> : null}
  </article>;
}

const STATUS_FILTERS: (PaymentStatus | "")[] = ["PENDING_REVIEW", "PENDING", "PAID", "EXPIRED", "CANCELLED", "FAILED", ""];

/** /plataforma/pagos: cola de pagos de planes con filtros y revisión de transferencias. */
export function PlatformPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("estado") ?? "PENDING_REVIEW") as PaymentStatus | "";
  const method = (params.get("metodo") ?? "") as "" | "WEB" | "QR" | "TRANSFER" | "CARD";
  const queue = useQuery({ queryKey: ["platform-payments", status, method], queryFn: () => veloraApi.platformPayments({ ...(status ? { status } : {}), ...(method ? { method } : {}) }), refetchInterval: 30_000 });
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key === "estado" && !value) next.set("estado", ""); setParams(next, { replace: true }); };
  return <section className="page">
    <div className="page-heading"><span className="eyebrow">PLATAFORMA</span><h1>Pagos de planes</h1><p>Revisa los comprobantes de transferencia y sigue los cobros por tarjeta y QR. Al aprobar, el plan se activa por 30 días.</p></div>
    <div className="filters-row">
      <label>Estado<select value={status} onChange={(event) => setFilter("estado", event.target.value)}>{STATUS_FILTERS.map((value) => <option key={value || "all"} value={value}>{value ? labelFor(PAYMENT_STATUS_LABELS, value) : "Todos"}</option>)}</select></label>
      <label>Método<select value={method} onChange={(event) => setFilter("metodo", event.target.value)}><option value="">Todos</option><option value="TRANSFER">Transferencia</option><option value="QR">QR</option><option value="WEB">Tarjeta (Stripe)</option><option value="CARD">Tarjeta DEMO</option></select></label>
    </div>
    {queue.isLoading ? <PageLoader /> : null}
    {queue.isError ? <Notice kind="error">No se pudo cargar la cola de pagos.</Notice> : null}
    {queue.data && queue.data.length === 0 ? <EmptyState title="Sin pagos con ese filtro">Cuando un propietario envíe un comprobante aparecerá aquí.</EmptyState> : null}
    <div className="review-list">{queue.data?.map((payment) => <ReviewCard key={payment.id} payment={payment} />)}</div>
  </section>;
}
