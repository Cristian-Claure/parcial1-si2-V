import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { OutboxEntry, SyncConflictOption, SyncProductCreate } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { sqliteOutbox } from "@/core/sync/syncDb";
import { resolveEntry, retryEntry, runOperationsSync, useOperationsSync } from "@/core/sync/syncEngine";
import { OperationsShell } from "@/features/operations/OperationsShell";
import { useManagerCompany } from "@/features/operations/useManagerCompany";
import { useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, Field, Notice } from "@/shared/ui";

const STATUS = { PENDING: "En cola", SYNCING: "Sincronizando", CONFLICT: "Conflicto", FAILED: "Error" } as const;
const OPTION: Record<SyncConflictOption, string> = { USE_EXISTING: "USAR EL EXISTENTE", ADJUST_AND_RETRY: "AJUSTAR Y REINTENTAR", DISCARD: "DESCARTAR", KEEP_MINE: "CONSERVAR EL MÍO", KEEP_SERVER: "CONSERVAR EL DEL SERVIDOR" };

function adjustment(entry: OutboxEntry, value: string): Record<string, unknown> {
  if (entry.code === "SKU_TAKEN") {
    const taken = String(entry.result?.server?.sku ?? "").toUpperCase();
    return { variants: (entry.operation.payload as SyncProductCreate).variants.map((variant) => variant.sku.toUpperCase() === taken ? { ...variant, sku: value.trim().toUpperCase() } : variant) };
  }
  if (entry.code === "EMAIL_TAKEN") return { email: value.trim() || null };
  return { taxId: value.trim() || null };
}

export default function SyncCenterScreen() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user)!;
  const isConnected = useNetworkStore((state) => state.isConnected);
  const company = useManagerCompany();
  const { version, running, lastMessage } = useOperationsSync();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [adjusting, setAdjusting] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return undefined;
    let active = true;
    void sqliteOutbox.pending(company.id, user.id).then((rows) => { if (active) setEntries(rows); });
    return () => { active = false; };
  }, [company, user.id, version]);

  const act = async (work: () => Promise<void>) => {
    setError(null);
    try { await work(); if (isConnected && company) await runOperationsSync(user.id, company.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la acción."); }
  };

  return (
    <OperationsShell active="sync">
      <Text style={commonStyles.heading}>Centro de sincronización</Text>
      {!isConnected ? <Notice kind="warning">Sin conexión: la cola se enviará al reconectar.</Notice> : null}
      {lastMessage ? <Notice kind={lastMessage.includes("revisión") ? "error" : "info"}>{lastMessage}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button title={running ? "SINCRONIZANDO…" : "SINCRONIZAR AHORA"} disabled={!isConnected || running || !company} onPress={() => { if (company) void runOperationsSync(user.id, company.id); }} />
      {entries.length === 0 ? <EmptyState title="Todo sincronizado">No hay operaciones pendientes en este teléfono.</EmptyState> : null}
      {entries.map((entry) => (
        <View key={entry.clientOperationId} style={[commonStyles.card, { gap: 8 }]}>
          <Text style={commonStyles.subheading}>{entry.label}</Text>
          <Text style={commonStyles.muted}>{STATUS[entry.status]} · intentos {entry.attempts}/5{entry.code ? ` · ${entry.code}` : ""}</Text>
          {entry.error ? <Text style={commonStyles.body}>{entry.error}</Text> : null}
          {entry.status === "CONFLICT" ? (entry.result?.options ?? []).map((option) => (
            <Button key={option} title={OPTION[option]} variant={option === "DISCARD" || option === "KEEP_SERVER" ? "danger" : "secondary"}
              onPress={() => option === "ADJUST_AND_RETRY" ? setAdjusting({ id: entry.clientOperationId, value: "" }) : void act(() => resolveEntry(entry, option))} />
          )) : null}
          {adjusting?.id === entry.clientOperationId ? (
            <View style={{ gap: 8 }}>
              <Field label={entry.code === "SKU_TAKEN" ? "Nuevo SKU" : entry.code === "EMAIL_TAKEN" ? "Otro correo (vacío = sin correo)" : "Otro documento"} value={adjusting.value} onChangeText={(value) => setAdjusting({ id: entry.clientOperationId, value })} autoCapitalize="none" />
              <Button title="REINTENTAR CON EL CAMBIO" onPress={() => void act(async () => { await resolveEntry(entry, "ADJUST_AND_RETRY", adjustment(entry, adjusting.value)); setAdjusting(null); })} />
            </View>
          ) : null}
          {entry.status === "FAILED" ? (
            <>
              <Button title="REINTENTAR" variant="secondary" onPress={() => void act(() => retryEntry(entry))} />
              <Button title="DESCARTAR" variant="danger" onPress={() => void act(() => resolveEntry({ ...entry, result: null }, "DISCARD"))} />
            </>
          ) : null}
        </View>
      ))}
    </OperationsShell>
  );
}
