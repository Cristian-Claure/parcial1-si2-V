import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, formatMoney, FULFILLMENT_LABELS, labelFor, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type OperationalOrderListItem } from "@velora/contracts";
import { ownerApi, type PanelRole } from "@/core/api/ownerApi";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, ErrorState, Field, Loading, Notice } from "@/shared/ui";
import { orderActions } from "./panelLogic";
import { PanelShell, usePanelContext } from "./OwnerShell";

const PAGE = 20;
type StatusFilter = "ALL" | "PENDING_PAYMENT" | "RESERVED" | "FULFILLED" | "CANCELLED";
const STATUS_FILTERS: [StatusFilter, string][] = [["ALL", "Todos"], ["PENDING_PAYMENT", "Pago pendiente"], ["RESERVED", "Por entregar"], ["FULFILLED", "Entregados"], ["CANCELLED", "Cancelados"]];

export function useOrdersQuery(role: PanelRole, companyId: string | null) {
  return useQuery({
    queryKey: ["panel-orders", role, companyId],
    enabled: Boolean(companyId),
    queryFn: () => cachedFetch(`panel-orders:${role}`, companyId!, () => ownerApi.orders(role, companyId)),
  });
}

function matchesStatus(order: OperationalOrderListItem, filter: StatusFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "PENDING_PAYMENT") return order.status === "RESERVED" && order.payments[0]?.status === "PENDING";
  if (filter === "RESERVED") return order.status === "RESERVED" && order.payments.some((payment) => payment.status === "PAID");
  return order.status === filter;
}

/** Pedidos operativos: el backend ya limita a las empresas del dueño o a la sucursal del encargado. */
export function OrdersScreen() {
  const commonStyles = useCommonStyles();
  const { role, companyId } = usePanelContext();
  const orders = useOrdersQuery(role, companyId);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [store, setStore] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const stores = useMemo(() => [...new Set((orders.data ?? []).map((order) => order.storeName))].sort(), [orders.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return (orders.data ?? []).filter((order) => matchesStatus(order, status) && (!store || order.storeName === store)
      && (!term || `${order.orderNumber} ${order.customerName}`.toLocaleLowerCase("es").includes(term)));
  }, [orders.data, status, store, search]);

  return (
    <PanelShell owner="orders" manager="orders" refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()}>
      <Text style={commonStyles.eyebrow}>PEDIDOS</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Pedidos de {role === "ADMIN" ? "tu empresa" : "tu sucursal"}</Text>
      <Field label="Buscar" value={search} onChangeText={(value) => { setSearch(value); setLimit(PAGE); }} placeholder="Número de pedido o cliente" autoCapitalize="characters" returnKeyType="search" />
      <Chips options={STATUS_FILTERS} value={status} onChange={(value) => { setStatus(value as StatusFilter); setLimit(PAGE); }} label="Estado" />
      {stores.length > 1 ? <Chips options={[["", "Todas"], ...stores.map((name) => [name, name] as [string, string])]} value={store ?? ""} onChange={(value) => { setStore(value || null); setLimit(PAGE); }} label="Sucursal" /> : null}
      {orders.isLoading ? <Loading label="Cargando pedidos…" /> : null}
      {orders.isError && !orders.data ? <ErrorState message={orders.error instanceof Error ? orders.error.message : "No se pudieron cargar los pedidos."} onRetry={() => void orders.refetch()} /> : null}
      {orders.data ? <Text style={commonStyles.muted} accessibilityLiveRegion="polite">{filtered.length} pedidos</Text> : null}
      {orders.data && filtered.length === 0 ? <EmptyState title="Sin pedidos con estos filtros">Cambia el estado o la sucursal.</EmptyState> : null}
      {filtered.slice(0, limit).map((order) => <OrderRow key={order.id} order={order} />)}
      {filtered.length > limit ? <Button title={`Mostrar más (${filtered.length - limit})`} variant="secondary" onPress={() => setLimit((value) => value + PAGE)} /> : null}
    </PanelShell>
  );
}

function OrderRow({ order }: { order: OperationalOrderListItem }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const { role } = usePanelContext();
  const latest = order.payments[0];
  const actions = orderActions(order);
  const attention = actions.pendingPaymentId || actions.canFulfill;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pedido ${order.orderNumber} de ${order.customerName}, ${labelFor(ORDER_STATUS_LABELS, order.status)}, ${formatMoney(order.total, order.currency)}`}
      onPress={() => router.push({ pathname: role === "ADMIN" ? "/owner/order/[id]" : "/manager/order/[id]", params: { id: order.id } } as never)}
      style={({ pressed }) => [commonStyles.card, attention && styles.attention, pressed && { opacity: 0.8 }]}
    >
      <View style={commonStyles.rowBetween}>
        <Text style={styles.number}>{order.orderNumber}</Text>
        <Text style={styles.total}>{formatMoney(order.total, order.currency)}</Text>
      </View>
      <Text style={commonStyles.body} numberOfLines={1}>{order.customerName}</Text>
      <Text style={commonStyles.muted} numberOfLines={1}>{order.storeName} · {labelFor(FULFILLMENT_LABELS, order.fulfillmentType)} · {formatDateTime(order.createdAt)}</Text>
      <View style={commonStyles.row}>
        <Text style={styles.pill}>{labelFor(ORDER_STATUS_LABELS, order.status)}</Text>
        {latest ? <Text style={styles.pill}>Pago: {labelFor(PAYMENT_STATUS_LABELS, latest.status)}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Detalle con pagos y las acciones de la web (con confirmación). Cancelar = reembolsar antes de entregar. */
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const { role, companyId } = usePanelContext();
  const client = useQueryClient();
  const orders = useOrdersQuery(role, companyId);
  const [message, setMessage] = useState<string | null>(null);
  const order = orders.data?.find((item) => item.id === orderId) ?? null;
  const done = async (text: string) => { setMessage(text); await client.invalidateQueries({ queryKey: ["panel-orders"] }); };
  const action = useMutation({
    mutationFn: async ({ kind, id }: { kind: "confirm" | "fail" | "fulfill" | "refund"; id: string }) => {
      if (kind === "confirm") await ownerApi.confirmPayment(role, id);
      else if (kind === "fail") await ownerApi.failPayment(role, id);
      else if (kind === "refund") await ownerApi.refundPayment(role, id);
      else await ownerApi.fulfillOrder(role, id);
      return kind;
    },
    onSuccess: (kind) => done({ confirm: "Pago confirmado.", fail: "Pago marcado como fallido.", refund: "Pago reembolsado.", fulfill: "Pedido entregado. El stock se descontó." }[kind]),
  });
  const ask = (title: string, body: string, confirmLabel: string, run: () => void, destructive = false) =>
    Alert.alert(title, body, [{ text: "Volver", style: "cancel" }, { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: run }]);

  if (orders.isLoading) return <PanelShell owner="orders" manager="orders"><Loading label="Cargando pedido…" /></PanelShell>;
  if (!order) return <PanelShell owner="orders" manager="orders"><ErrorState message="No encontramos este pedido en tu alcance." onRetry={() => void orders.refetch()} /><Button title="Volver" variant="secondary" onPress={() => router.back()} /></PanelShell>;
  const actions = orderActions(order);
  const pending = order.payments.find((payment) => payment.id === actions.pendingPaymentId);

  return (
    <PanelShell owner="orders" manager="orders" refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back} hitSlop={8}><Text style={styles.backText}>← Pedidos</Text></Pressable>
      <Text style={commonStyles.eyebrow}>{labelFor(ORDER_STATUS_LABELS, order.status).toUpperCase()}</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">{order.orderNumber}</Text>
      {message ? <Notice kind="success">{message}</Notice> : null}
      {action.isError ? <Notice kind="error">{action.error instanceof Error ? action.error.message : "No se pudo completar la acción."}</Notice> : null}
      <View style={commonStyles.card}>
        <Detail label="Cliente" value={`${order.customerName}${order.customerEmail ? ` · ${order.customerEmail}` : ""}`} />
        <Detail label="Sucursal" value={`${order.storeName} · ${order.warehouseName}`} />
        <Detail label="Entrega" value={labelFor(FULFILLMENT_LABELS, order.fulfillmentType)} />
        <Detail label="Creado" value={formatDateTime(order.createdAt)} />
        {order.fulfilledAt ? <Detail label="Entregado" value={formatDateTime(order.fulfilledAt)} /> : null}
        <View style={commonStyles.divider} />
        <View style={commonStyles.rowBetween}><Text style={commonStyles.subheading}>Total</Text><Text style={styles.total}>{formatMoney(order.total, order.currency)}</Text></View>
      </View>
      <Text style={commonStyles.subheading}>Pagos</Text>
      {order.payments.length === 0 ? <Text style={commonStyles.muted}>Sin pagos registrados.</Text> : order.payments.map((payment) => (
        <View key={payment.id} style={[commonStyles.card, commonStyles.rowBetween]}>
          <View style={{ flex: 1 }}>
            <Text style={commonStyles.body}>{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</Text>
            <Text style={commonStyles.muted}>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</Text>
          </View>
          <Text style={styles.total}>{formatMoney(payment.amount, payment.currency)}</Text>
        </View>
      ))}
      {pending ? (
        <>
          <Button title="Confirmar pago" busy={action.isPending} onPress={() => ask("Confirmar pago", `Se registrará ${formatMoney(pending.amount, pending.currency)} (${labelFor(PAYMENT_METHOD_LABELS, pending.method)}) como recibido.`, "Confirmar", () => action.mutate({ kind: "confirm", id: pending.id }))} />
          <Button title="Marcar pago fallido" variant="danger" busy={action.isPending} onPress={() => ask("Marcar pago fallido", "El pedido sigue reservado y el cliente puede registrar otro intento.", "Marcar fallido", () => action.mutate({ kind: "fail", id: pending.id }), true)} />
        </>
      ) : null}
      {actions.canFulfill ? <Button title="Entregar pedido" busy={action.isPending} onPress={() => ask("Entregar pedido", "Se descontará el stock reservado y el pedido quedará entregado.", "Entregar", () => action.mutate({ kind: "fulfill", id: order.id }))} /> : null}
      {actions.refundPaymentId ? <Button title="Cancelar y reembolsar" variant="danger" busy={action.isPending} onPress={() => ask("Reembolsar pago", "Solo es posible antes de la entrega. El pago quedará reembolsado.", "Reembolsar", () => action.mutate({ kind: "refund", id: actions.refundPaymentId! }), true)} /> : null}
      {!pending && !actions.canFulfill ? <Notice>Este pedido no tiene acciones pendientes.</Notice> : null}
    </PanelShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const commonStyles = useCommonStyles();
  return <View style={{ gap: 2 }}><Text style={commonStyles.label}>{label}</Text><Text style={commonStyles.body}>{value}</Text></View>;
}

export function Chips({ options, value, onChange, label }: { options: [string, string][]; value: string; onChange: (value: string) => void; label: string }) {
  const commonStyles = useCommonStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel={`Filtro: ${label}`}>
      {options.map(([key, text]) => {
        const active = value === key;
        return (
          <Pressable key={key || "all"} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[commonStyles.chip, active && commonStyles.chipActive]}>
            <Text style={[commonStyles.chipText, active && commonStyles.chipTextActive]}>{text}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  attention: { borderLeftWidth: 5, borderLeftColor: colors.accent },
  number: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.ink },
  total: { fontFamily: "Inter_800ExtraBold", fontSize: 16, color: colors.ink },
  pill: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.accentDeep, backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.accentDeep },
}));
