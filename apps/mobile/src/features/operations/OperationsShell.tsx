import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNetworkStore } from "@/core/network/networkStore";
import { useOperationsSync } from "@/core/sync/syncEngine";
import { makeStyles, useCommonStyles, useTheme } from "@/shared/theme";
import { BottomNav, type NavItem } from "@/shared/ui";
import { useManagerCompany } from "./useManagerCompany";

export type OperationsNavKey = "home" | "orders" | "stock" | "customer" | "product" | "sync";

const items: NavItem<OperationsNavKey>[] = [
  { key: "home", label: "Inicio", href: "/operations" },
  { key: "orders", label: "Pedidos", href: "/manager/orders" },
  { key: "stock", label: "Stock", href: "/manager/inventory" },
  { key: "customer", label: "Cliente", href: "/register-customer" },
  { key: "product", label: "Producto", href: "/register-product" },
  { key: "sync", label: "Sincronizar", href: "/sync-center" },
];

/** Shell del modo operaciones (solo STORE_MANAGER): empresa, estado de red y cola. */
export function OperationsShell({ active, children, refreshing = false, onRefresh }: { active: OperationsNavKey; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const styles = useStyles(); const commonStyles = useCommonStyles(); const { colors } = useTheme();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const counts = useOperationsSync((state) => state.counts);
  const company = useManagerCompany();
  const attention = counts.conflicts + counts.failed;
  const status = !isConnected ? "Sin conexión" : attention > 0 ? `${attention} por revisar` : counts.pending > 0 ? `${counts.pending} en cola` : "Al día";
  return (
    <SafeAreaView style={commonStyles.page} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={commonStyles.eyebrow}>MODO OPERACIONES</Text>
          <Text style={styles.company} numberOfLines={1}>{company?.brand?.name ?? company?.name ?? "Mi sucursal"}</Text>
        </View>
        <View style={[styles.pill, !isConnected ? styles.pillOffline : attention > 0 ? styles.pillWarn : styles.pillOk]} accessibilityLabel={`Estado de sincronización: ${status}`}>
          <Text style={styles.pillText}>{status}</Text>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={commonStyles.scrollContent}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomNav items={items} active={active} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.surface },
  company: { fontSize: 20, color: colors.ink, fontWeight: "700" },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillOk: { backgroundColor: colors.accentSoft },
  pillWarn: { backgroundColor: colors.warningSoft },
  pillOffline: { backgroundColor: colors.errorSoft },
  pillText: { fontSize: 12, fontWeight: "700", color: colors.ink },
}));
