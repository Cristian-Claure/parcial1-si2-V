import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNetworkStore } from "@/core/network/networkStore";
import { useOperationsSync } from "@/core/sync/syncEngine";
import { colors, commonStyles } from "@/shared/theme";
import { useManagerCompany } from "./useManagerCompany";

export type OperationsNavKey = "home" | "customer" | "product" | "sync";

const items: { key: OperationsNavKey; label: string; href: string }[] = [
  { key: "home", label: "Inicio", href: "/operations" },
  { key: "customer", label: "Cliente", href: "/register-customer" },
  { key: "product", label: "Producto", href: "/register-product" },
  { key: "sync", label: "Sincronizar", href: "/sync-center" },
];

/** Shell del modo operaciones (solo STORE_MANAGER): empresa, estado de red y cola. */
export function OperationsShell({ active, children }: { active: OperationsNavKey; children: ReactNode }) {
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={commonStyles.scrollContent}>{children}</ScrollView>
      <View style={styles.nav}>
        {items.map((item) => (
          <Pressable key={item.key} onPress={() => router.replace(item.href as never)} style={[styles.navItem, active === item.key && styles.navItemActive]} accessibilityRole="button">
            <Text style={[styles.navText, active === item.key && styles.navTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.surface },
  company: { fontSize: 20, color: colors.ink, fontWeight: "700" },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillOk: { backgroundColor: colors.accentSoft },
  pillWarn: { backgroundColor: "#F3DDD3" },
  pillOffline: { backgroundColor: "#EBD9D7" },
  pillText: { fontSize: 12, fontWeight: "700", color: colors.ink },
  nav: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.card },
  navItem: { flex: 1, paddingVertical: 14, alignItems: "center" },
  navItemActive: { borderTopWidth: 2, borderTopColor: colors.accent },
  navText: { fontSize: 13, color: colors.inkSoft, fontWeight: "600" },
  navTextActive: { color: colors.ink },
});
