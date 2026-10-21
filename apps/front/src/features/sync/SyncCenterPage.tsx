import { useCallback, useEffect, useState } from "react";
import type { SyncConflictOption, SyncProductCreate } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { offlineDb, offlineCache, type OfflinePosSaleEntry } from "../../core/offline/offlineDb";
import { discardOutboxEntry, resolveOutboxConflict, retryOutboxEntry, runOperationsSync, useSyncStatus } from "../../core/sync/syncEngine";
import type { OutboxEntry, PendingImage } from "../../core/sync/types";
import { useOperationalCompanyId } from "../../core/sync/useOperationalContext";
import { Notice } from "../../shared/feedback/Notice";

const STATUS_LABEL = { PENDING: "En cola", SYNCING: "Sincronizando", CONFLICT: "Conflicto", FAILED: "Error" } as const;
const OPTION_LABEL: Record<SyncConflictOption, string> = {
  USE_EXISTING: "Usar el existente", ADJUST_AND_RETRY: "Ajustar y reintentar", DISCARD: "Descartar", KEEP_MINE: "Conservar el mío", KEEP_SERVER: "Conservar el del servidor",
};

function describeServer(entry: OutboxEntry): string | null {
  const server = entry.result?.server;
  if (!server) return null;
  if (typeof server.productName === "string") return `Producto existente: ${server.productName} (SKU ${String(server.sku)})`;
  if (typeof server.sku === "string") return `SKU en uso: ${server.sku}`;
  if (typeof server.firstName === "string") return `Cliente existente: ${server.firstName} ${String(server.lastName ?? "")}${server.email ? ` · ${String(server.email)}` : ""}`;
  if (typeof server.version === "number") return `Versión del servidor: ${server.version}${typeof server.name === "string" ? ` · ${server.name}` : ""}`;
  return null;
}

/** Campo a corregir para "Ajustar y reintentar" según el código del conflicto. */
function AdjustForm({ entry, onSubmit }: { entry: OutboxEntry; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [value, setValue] = useState("");
  const code = entry.code;
  const label = code === "SKU_TAKEN" ? "Nuevo SKU" : code === "EMAIL_TAKEN" ? "Otro correo (vacío = sin correo)" : code === "DOCUMENT_TAKEN" ? "Otro documento" : "Valor";
  const build = (): Record<string, unknown> => {
    if (code === "SKU_TAKEN") {
      const product = entry.operation.payload as SyncProductCreate;
      const taken = String(entry.result?.server?.sku ?? "").toUpperCase();
      return { variants: product.variants.map((variant) => variant.sku.toUpperCase() === taken ? { ...variant, sku: value.trim().toUpperCase() } : variant) };
    }
    if (code === "EMAIL_TAKEN") return { email: value.trim() || null };
    if (code === "DOCUMENT_TAKEN") return { taxId: value.trim() || null };
    return {};
  };
  return <form className="inline-form" onSubmit={(event) => { event.preventDefault(); onSubmit(build()); }}><input aria-label={label} placeholder={label} value={value} onChange={(event) => setValue(event.target.value)} required={code === "SKU_TAKEN"} /><button className="button secondary small">Reintentar</button></form>;
}

/** Centro de sincronización: cola genérica (clientes y productos), ventas POS sin conexión e imágenes. */
export function SyncCenterPage() {
  const user = useAuthStore((state) => state.user)!;
  const companyId = useOperationalCompanyId();
  const { online, running, lastMessage, lastSyncAt } = useSyncStatus();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [posSales, setPosSales] = useState<OfflinePosSaleEntry[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEntries(companyId ? (await offlineDb.syncOutbox.where("[companyId+userId]").equals([companyId, user.id]).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []);
    setPosSales(await offlineCache.posSales(user.id));
    setImages(companyId ? await offlineDb.pendingImages.where("companyId").equals(companyId).toArray() : []);
  }, [companyId, user.id]);
  useEffect(() => {
    const refresh = () => { void load(); };
    refresh();
    window.addEventListener("velora:sync-changed", refresh);
    return () => window.removeEventListener("velora:sync-changed", refresh);
  }, [load]);

  const act = async (work: () => Promise<void>) => { setError(null); try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la acción."); } };
  const resolve = (entry: OutboxEntry, option: SyncConflictOption, payload?: Record<string, unknown>) => act(async () => { await resolveOutboxConflict(entry, option, payload); setAdjusting(null); if (online) await runOperationsSync(user, companyId); });

  return <section className="page">
    <div className="page-heading row"><div><span className="eyebrow">SINCRONIZACIÓN</span><h1>Centro de sincronización</h1><p>Todo lo que registras sin conexión queda en una sola cola y se envía al volver la red. Los conflictos esperan tu decisión.</p></div>
      <button type="button" className="button primary" disabled={!online || running} onClick={() => void runOperationsSync(user, companyId)}>{running ? "Sincronizando…" : "Sincronizar ahora"}</button></div>
    {!online ? <Notice>Estás sin conexión. Puedes seguir registrando clientes y productos; se enviarán automáticamente al reconectar.</Notice> : null}
    {lastMessage ? <Notice kind={lastMessage.includes("revisión") ? "error" : "success"}>{lastMessage}{lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("es-BO")}` : ""}</Notice> : null}
    {error ? <Notice kind="error">{error}</Notice> : null}
    <div className="panel"><h2>Operaciones ({entries.length})</h2>
      {entries.length === 0 ? <p className="field-hint">No hay operaciones pendientes.</p> : <div className="sync-list">{entries.map((entry) => <article key={entry.clientOperationId} className="sync-item" data-status={entry.status}>
        <header><strong>{entry.label}</strong><span className="sync-status">{STATUS_LABEL[entry.status]}</span></header>
        <p className="field-hint">{new Date(entry.createdAt).toLocaleString("es-BO")} · intentos {entry.attempts}/5{entry.code ? ` · ${entry.code}` : ""}</p>
        {entry.error ? <p className="sync-error">{entry.error}</p> : null}
        {describeServer(entry) ? <p className="field-hint">{describeServer(entry)}</p> : null}
        <div className="actions">
          {entry.status === "CONFLICT" ? (entry.result?.options ?? []).map((option) => option === "ADJUST_AND_RETRY"
            ? <button key={option} type="button" className="button secondary small" onClick={() => setAdjusting(adjusting === entry.clientOperationId ? null : entry.clientOperationId)}>{OPTION_LABEL[option]}</button>
            : <button key={option} type="button" className={option === "DISCARD" || option === "KEEP_SERVER" ? "button danger-outline small" : "button secondary small"} onClick={() => void resolve(entry, option)}>{OPTION_LABEL[option]}</button>) : null}
          {entry.status === "FAILED" ? <><button type="button" className="button secondary small" onClick={() => void act(() => retryOutboxEntry(entry))}>Reintentar</button><button type="button" className="button danger-outline small" onClick={() => void act(() => discardOutboxEntry(entry))}>Descartar</button></> : null}
        </div>
        {adjusting === entry.clientOperationId ? <AdjustForm entry={entry} onSubmit={(payload) => void resolve(entry, "ADJUST_AND_RETRY", payload)} /> : null}
      </article>)}</div>}
    </div>
    {posSales.length > 0 ? <div className="panel"><h2>Ventas POS sin conexión ({posSales.length})</h2><div className="sync-list">{posSales.map((sale) => <article key={sale.id} className="sync-item" data-status={sale.status}>
      <header><strong>Venta {sale.total.toFixed(2)} {sale.currency}</strong><span className="sync-status">{STATUS_LABEL[sale.status]}</span></header>
      {sale.errorMessage ? <p className="sync-error">{sale.errorMessage}</p> : null}
      {sale.status !== "PENDING" ? <div className="actions"><button type="button" className="button secondary small" onClick={() => void act(async () => { await offlineCache.retryPosSale(sale.id); await load(); })}>Reintentar</button><button type="button" className="button danger-outline small" onClick={() => void act(async () => { await offlineCache.discardPosSale(sale.id); await load(); })}>Descartar</button></div> : null}
    </article>)}</div></div> : null}
    {images.length > 0 ? <div className="panel"><h2>Imágenes de productos ({images.length})</h2><p className="field-hint">Se suben después de que su producto se sincroniza.</p><ul className="contrast-list">{images.map((image) => <li key={image.id} className={image.status === "FAILED" ? "bad" : ""}>{image.filename} · {image.status === "FAILED" ? `error: ${image.error ?? ""}` : "en espera"}</li>)}</ul></div> : null}
  </section>;
}
