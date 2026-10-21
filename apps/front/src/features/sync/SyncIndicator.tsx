import { Link } from "react-router-dom";
import { useAuthStore } from "../../core/auth/authStore";
import { runOperationsSync, useSyncStatus } from "../../core/sync/syncEngine";
import { useOperationalCompanyId } from "../../core/sync/useOperationalContext";

/** Indicador online/offline con contadores de la cola y acceso al centro de sincronización. */
export function SyncIndicator({ centerPath }: { centerPath: string }) {
  const user = useAuthStore((state) => state.user);
  const companyId = useOperationalCompanyId();
  const { online, running, counts } = useSyncStatus();
  const attention = counts.conflicts + counts.failed;
  const label = !online ? "Sin conexión" : running ? "Sincronizando…" : attention > 0 ? `${attention} por revisar` : counts.pending > 0 ? `${counts.pending} en cola` : "Al día";
  const tone = !online ? "offline" : attention > 0 ? "warn" : "ok";
  return <div className="sync-indicator" data-tone={tone}>
    <Link to={centerPath} className="sync-indicator-link" aria-live="polite"><span className="sync-dot" aria-hidden="true" />{label}{online && counts.pending > 0 && attention > 0 ? ` · ${counts.pending} en cola` : ""}</Link>
    {online && user ? <button type="button" className="text-button" disabled={running} onClick={() => void runOperationsSync(user, companyId)}>Sincronizar</button> : null}
  </div>;
}
