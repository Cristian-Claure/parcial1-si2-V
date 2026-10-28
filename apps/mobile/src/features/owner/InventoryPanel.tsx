import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { labelFor, MOVEMENT_TYPE_LABELS, stockLevel, type InventoryMovementType, type InventoryStock } from "@velora/contracts";
import { ownerApi } from "@/core/api/ownerApi";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, ErrorState, Field, Loading, Notice } from "@/shared/ui";
import { Chips } from "./OrdersPanel";
import { PanelShell, usePanelContext } from "./OwnerShell";

const PAGE = 25;
const QUICK_TYPES: InventoryMovementType[] = ["ENTRY", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"];
const LEVEL_LABELS = { agotado: "Agotado", bajo: "Bajo", normal: "Normal" } as const;

/** Stock por almacén y variante. El backend limita los almacenes (empresas del dueño o sucursal del encargado). */
export function InventoryScreen() {
  const commonStyles = useCommonStyles();
  const { role, companyId } = usePanelContext();
  const warehouses = useQuery({ queryKey: ["panel-warehouses", role, companyId], enabled: Boolean(companyId), queryFn: () => cachedFetch(`panel-warehouses:${role}`, companyId!, ownerApi.warehouses) });
  // El dueño puede tener varias empresas: se muestran solo los almacenes de las sucursales de la activa.
  const stores = useQuery({ queryKey: ["panel-stores", companyId], enabled: role === "ADMIN" && Boolean(companyId), queryFn: () => cachedFetch("panel-stores", companyId!, () => ownerApi.stores(companyId!)) });
  const visibleWarehouses = useMemo(() => {
    const all = (warehouses.data ?? []).filter((warehouse) => warehouse.active);
    if (role !== "ADMIN") return all;
    const ids = new Set((stores.data ?? []).map((store) => store.id));
    return all.filter((warehouse) => ids.has(warehouse.storeId));
  }, [warehouses.data, stores.data, role]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const current = visibleWarehouses.find((warehouse) => warehouse.id === warehouseId) ?? visibleWarehouses.find((warehouse) => warehouse.defaultWarehouse) ?? visibleWarehouses[0] ?? null;
  const stock = useQuery({ queryKey: ["panel-stock", current?.id], enabled: Boolean(current), queryFn: () => cachedFetch("panel-stock", current!.id, () => ownerApi.stock(current!.id)) });
  const [level, setLevel] = useState<"" | "bajo" | "agotado">("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return (stock.data ?? []).filter((item) => (!level || stockLevel(item.availableQuantity) === level) && (!term || `${item.sku} ${item.productName} ${item.size} ${item.color}`.toLocaleLowerCase("es").includes(term)))
      .sort((a, b) => a.availableQuantity - b.availableQuantity);
  }, [stock.data, level, search]);
  const counts = useMemo(() => ({
    bajo: (stock.data ?? []).filter((item) => stockLevel(item.availableQuantity) === "bajo").length,
    agotado: (stock.data ?? []).filter((item) => stockLevel(item.availableQuantity) === "agotado").length,
  }), [stock.data]);

  const refresh = () => { void warehouses.refetch(); void stock.refetch(); };
  return (
    <PanelShell owner="inventory" manager="stock" refreshing={stock.isRefetching} onRefresh={refresh}>
      <Text style={commonStyles.eyebrow}>INVENTARIO</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Stock por almacén</Text>
      {warehouses.isLoading ? <Loading label="Cargando almacenes…" /> : null}
      {warehouses.isError && !warehouses.data ? <ErrorState message={warehouses.error instanceof Error ? warehouses.error.message : "No se pudieron cargar los almacenes."} onRetry={refresh} /> : null}
      {warehouses.data && visibleWarehouses.length === 0 ? <EmptyState title="Sin almacenes activos">Crea un almacén desde la web para empezar a registrar stock.</EmptyState> : null}
      {visibleWarehouses.length > 1 ? <Chips label="Almacén" options={visibleWarehouses.map((warehouse) => [warehouse.id, `${warehouse.storeName} · ${warehouse.name}`])} value={current?.id ?? ""} onChange={(id) => { setWarehouseId(id); setLimit(PAGE); setEditing(null); }} /> : null}
      {current ? (
        <>
          <Chips label="Nivel" options={[["", "Todos"], ["bajo", `Bajo (${counts.bajo})`], ["agotado", `Agotado (${counts.agotado})`]]} value={level} onChange={(value) => { setLevel(value as typeof level); setLimit(PAGE); }} />
          <Field label="Buscar" value={search} onChangeText={(value) => { setSearch(value); setLimit(PAGE); }} placeholder="SKU, producto, talla o color" autoCapitalize="none" returnKeyType="search" />
          {stock.isLoading ? <Loading label="Cargando stock…" /> : null}
          {stock.isError && !stock.data ? <ErrorState message={stock.error instanceof Error ? stock.error.message : "No se pudo cargar el stock."} onRetry={refresh} /> : null}
          {stock.data && filtered.length === 0 ? <EmptyState title="Ninguna variante coincide">Cambia el filtro o la búsqueda.</EmptyState> : null}
          {filtered.slice(0, limit).map((item) => <StockRow key={item.id} item={item} warehouseId={current.id} open={editing === item.id} onToggle={() => setEditing(editing === item.id ? null : item.id)} />)}
          {filtered.length > limit ? <Button title={`Mostrar más (${filtered.length - limit})`} variant="secondary" onPress={() => setLimit((value) => value + PAGE)} /> : null}
        </>
      ) : null}
    </PanelShell>
  );
}

function StockRow({ item, warehouseId, open, onToggle }: { item: InventoryStock; warehouseId: string; open: boolean; onToggle: () => void }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const level = stockLevel(item.availableQuantity);
  return (
    <View style={[commonStyles.card, level !== "normal" && styles[level]]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${item.productName}, talla ${item.size}, ${item.color}: ${item.availableQuantity} disponibles, ${LEVEL_LABELS[level]}. Toca para registrar un movimiento`} onPress={onToggle} style={{ gap: 4, minHeight: 44 }}>
        <View style={commonStyles.rowBetween}>
          <Text style={[commonStyles.body, styles.title, { flex: 1 }]} numberOfLines={1}>{item.productName}</Text>
          <Text style={styles.badge}>{LEVEL_LABELS[level]}</Text>
        </View>
        <Text style={commonStyles.muted}>{item.sku} · {item.size} / {item.color}</Text>
        <Text style={commonStyles.muted}>Disponible {item.availableQuantity} · Físico {item.physicalQuantity} · Reservado {item.committedQuantity}</Text>
      </Pressable>
      {open ? <QuickMovement item={item} warehouseId={warehouseId} onDone={onToggle} /> : null}
    </View>
  );
}

function QuickMovement({ item, warehouseId, onDone }: { item: InventoryStock; warehouseId: string; onDone: () => void }) {
  const commonStyles = useCommonStyles();
  const client = useQueryClient();
  const [type, setType] = useState<InventoryMovementType>("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const movement = useMutation({
    mutationFn: () => ownerApi.movement({ warehouseId, variantId: item.variantId, movementType: type, quantity: Number(quantity), reason: reason.trim(), referenceType: null, referenceId: null }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["panel-stock", warehouseId] }); onDone(); },
  });
  const submit = () => {
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount <= 0) { setError("Escribe una cantidad entera mayor a 0."); return; }
    if (type === "ADJUSTMENT_OUT" && amount > item.availableQuantity) { setError(`No puedes restar más de lo disponible (${item.availableQuantity}).`); return; }
    if (reason.trim().length < 3) { setError("Indica el motivo (por ejemplo, conteo físico o llegada de proveedor)."); return; }
    setError(null);
    movement.mutate();
  };
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <View style={commonStyles.divider} />
      <Chips label="Tipo de movimiento" options={QUICK_TYPES.map((value) => [value, labelFor(MOVEMENT_TYPE_LABELS, value)])} value={type} onChange={(value) => setType(value as InventoryMovementType)} />
      <Field label="Cantidad" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0" />
      <Field label="Motivo" value={reason} onChangeText={setReason} placeholder="Conteo físico, llegada de proveedor…" maxLength={500} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      {movement.isError ? <Notice kind="error">{movement.error instanceof Error ? movement.error.message : "No se pudo registrar el movimiento."}</Notice> : null}
      <Button title="Registrar movimiento" busy={movement.isPending} onPress={submit} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  bajo: { borderLeftWidth: 5, borderLeftColor: colors.warning },
  agotado: { borderLeftWidth: 5, borderLeftColor: colors.error },
  badge: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.accentDeep },
  title: { color: colors.ink },
}));
