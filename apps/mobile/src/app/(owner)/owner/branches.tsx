import { useMemo } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ownerApi } from "@/core/api/ownerApi";
import { useOwnerCompany } from "@/core/company/ownerStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { useOwnerStores } from "@/features/owner/ownerQueries";
import { openWeb } from "@/shared/lib/webUrl";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, ErrorState, Loading } from "@/shared/ui";

/** Sucursales de la empresa activa: encargado, almacenes y estado (crear o editar se hace en la web). */
export default function OwnerBranchesScreen() {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const company = useOwnerCompany();
  const companyId = company?.id ?? null;
  const stores = useOwnerStores(companyId);
  const managers = useQuery({ queryKey: ["owner-managers", companyId], enabled: Boolean(companyId), queryFn: () => cachedFetch("owner-managers", companyId!, () => ownerApi.managers(companyId!)) });
  const warehouses = useQuery({ queryKey: ["panel-warehouses", "ADMIN", companyId], enabled: Boolean(companyId), queryFn: () => cachedFetch("panel-warehouses:ADMIN", companyId!, ownerApi.warehouses) });
  const byStore = useMemo(() => {
    const map = new Map<string, { managers: string[]; warehouses: { name: string; active: boolean; main: boolean }[] }>();
    for (const store of stores.data ?? []) map.set(store.id, { managers: [], warehouses: [] });
    for (const manager of managers.data ?? []) if (manager.status === "ACTIVE") map.get(manager.storeId ?? "")?.managers.push(`${manager.firstName} ${manager.lastName}`);
    for (const warehouse of warehouses.data ?? []) map.get(warehouse.storeId)?.warehouses.push({ name: warehouse.name, active: warehouse.active, main: warehouse.defaultWarehouse });
    return map;
  }, [stores.data, managers.data, warehouses.data]);
  const refresh = () => { void stores.refetch(); void managers.refetch(); void warehouses.refetch(); };

  return (
    <OwnerShell active="more" refreshing={stores.isRefetching} onRefresh={refresh}>
      <Text style={commonStyles.eyebrow}>SUCURSALES</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Tus sucursales</Text>
      {stores.isLoading ? <Loading label="Cargando sucursales…" /> : null}
      {stores.isError && !stores.data ? <ErrorState message={stores.error instanceof Error ? stores.error.message : "No se pudieron cargar las sucursales."} onRetry={refresh} /> : null}
      {stores.data && stores.data.length === 0 ? <EmptyState title="Aún no tienes sucursales" actionTitle="Crear sucursal en la web" onAction={() => void openWeb("/admin")}>Crea tu primera sucursal para vender y retirar en tienda.</EmptyState> : null}
      {(stores.data ?? []).map((store) => {
        const info = byStore.get(store.id);
        return (
          <View key={store.id} style={commonStyles.card}>
            <View style={commonStyles.rowBetween}>
              <Text style={styles.name} numberOfLines={1}>{store.name}</Text>
              <Text style={[styles.status, !store.active && styles.inactive]}>{store.active ? "Activa" : "Inactiva"}</Text>
            </View>
            <Text style={commonStyles.muted}>{store.code}{store.address ? ` · ${store.address}` : ""}</Text>
            <Text style={commonStyles.body}>Encargado: {info?.managers.length ? info.managers.join(", ") : "sin asignar"}</Text>
            <Text style={commonStyles.body}>Almacenes: {info?.warehouses.length ? info.warehouses.map((warehouse) => `${warehouse.name}${warehouse.main ? " (principal)" : ""}${warehouse.active ? "" : " (inactivo)"}`).join(", ") : "ninguno"}</Text>
          </View>
        );
      })}
      <Button title="Crear o editar sucursales en la web" variant="secondary" onPress={() => void openWeb("/admin")} />
    </OwnerShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  name: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 16, color: colors.ink },
  status: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.success },
  inactive: { color: colors.inkSoft },
}));
