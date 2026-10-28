import { useState } from "react";
import { Text, View } from "react-native";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { enqueueOperation, newId, runOperationsSync } from "@/core/sync/syncEngine";
import { buildCustomerOperation, type CustomerDraft } from "@/features/operations/operationBuilders";
import { useOperationsCompany } from "@/features/operations/useManagerCompany";
import { PanelShell } from "@/features/owner/OwnerShell";
import { useOwnerCompany } from "@/core/company/ownerStore";
import { useOwnerOperationsPull } from "@/features/owner/useOwnerOperationsPull";
import { useCommonStyles } from "@/shared/theme";
import { Button, Field, Notice } from "@/shared/ui";

const empty: CustomerDraft = { firstName: "", lastName: "", phone: "", email: "", taxId: "", customerType: "B2C", businessName: "" };

export default function RegisterCustomerScreen() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user)!;
  const isConnected = useNetworkStore((state) => state.isConnected);
  const company = useOperationsCompany(user.role, useOwnerCompany());
  // El propietario no pasa por el layout del encargado: trae categorías y almacenes de su empresa.
  useOwnerOperationsPull(user.role, user.id, company?.id ?? null, isConnected);
  const [draft, setDraft] = useState<CustomerDraft>(empty);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof CustomerDraft) => (value: string) => setDraft({ ...draft, [field]: value });

  const submit = async () => {
    setMessage(null); setError(null);
    if (!company) { setError("Sincroniza una vez con conexión para identificar tu tienda."); return; }
    const built = buildCustomerOperation(draft, newId);
    if (!built.ok) { setError(built.error); return; }
    await enqueueOperation(company.id, user.id, built.operation, built.label, { entityType: "CUSTOMER", id: built.value.id, data: { ...built.value, hasAccess: false, version: 0 } });
    setDraft(empty);
    setMessage(isConnected ? `${built.label} registrado. Sincronizando…` : `${built.label} guardado en el teléfono; se enviará al reconectar.`);
    if (isConnected) void runOperationsSync(user.id, company.id);
  };

  return (
    <PanelShell owner="more" manager="customer">
      <Text style={commonStyles.heading}>Registrar cliente</Text>
      <Text style={commonStyles.muted}>Queda como cliente de la tienda sin acceso. Si luego se registra con el mismo correo, se vincula a esta ficha.</Text>
      {message ? <Notice kind="success">{message}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ gap: 12 }}>
        <Field label="Nombre" value={draft.firstName} onChangeText={set("firstName")} autoCapitalize="words" />
        <Field label="Apellido" value={draft.lastName} onChangeText={set("lastName")} autoCapitalize="words" />
        <Field label="Teléfono" value={draft.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field label="Documento (CI/NIT)" value={draft.taxId} onChangeText={set("taxId")} />
        <Field label="Correo (opcional)" value={draft.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Button title="REGISTRAR CLIENTE" onPress={() => void submit()} />
      </View>
    </PanelShell>
  );
}
