import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { MirrorRecord } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { listMirror } from "@/core/sync/syncDb";
import { useOperationsSync } from "@/core/sync/syncEngine";
import { OperationsShell } from "@/features/operations/OperationsShell";
import { useManagerCompany } from "@/features/operations/useManagerCompany";
import { useCommonStyles } from "@/shared/theme";
import { Button, Notice } from "@/shared/ui";

export default function OperationsHome() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user)!;
  const logout = useAuthStore((state) => state.logout);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const company = useManagerCompany();
  const { counts, version, lastMessage } = useOperationsSync();
  const [customers, setCustomers] = useState<MirrorRecord[]>([]);
  const [products, setProducts] = useState<MirrorRecord[]>([]);

  useEffect(() => {
    if (!company) return;
    void listMirror(company.id, "CUSTOMER").then(setCustomers);
    void listMirror(company.id, "PRODUCT").then(setProducts);
  }, [company, version]);

  return (
    <OperationsShell active="home">
      <Text style={commonStyles.heading}>Hola, {user.firstName}.</Text>
      <Text style={commonStyles.body}>Registra clientes y productos con o sin internet. Todo queda en una cola y se sincroniza al volver la red.</Text>
      {!isConnected ? <Notice kind="warning">Sin conexión: lo que registres se guardará en el teléfono.</Notice> : null}
      {lastMessage ? <Notice kind={lastMessage.includes("revisión") ? "error" : "info"}>{lastMessage}</Notice> : null}
      <View style={[commonStyles.card, { gap: 6 }]}>
        <Text style={commonStyles.subheading}>Cola de sincronización</Text>
        <Text style={commonStyles.body}>{counts.pending} en cola · {counts.conflicts} conflictos · {counts.failed} con error</Text>
        <Text style={commonStyles.muted}>{customers.length} clientes y {products.length} productos disponibles sin red.</Text>
      </View>
      <Button title="REGISTRAR CLIENTE" onPress={() => router.replace("/register-customer" as never)} />
      <Button title="REGISTRAR PRODUCTO" variant="secondary" onPress={() => router.replace("/register-product" as never)} />
      <Button title="CENTRO DE SINCRONIZACIÓN" variant="secondary" onPress={() => router.replace("/sync-center" as never)} />
      <Button title="CERRAR SESIÓN" variant="danger" onPress={() => { void logout().then(() => router.replace("/login" as never)); }} />
    </OperationsShell>
  );
}
