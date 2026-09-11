import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  OrderResponse,
  PaymentMethod,
  PaymentResponse,
} from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import {
  deleteOfflineOrder,
  listOfflineOrders,
  retryOfflineOrder,
  type OfflineOrderEntry,
} from "@/core/offline/mobileDb";
import { syncOfflineOrders } from "@/core/offline/syncOfflineOrders";
import {
  paymentMethodLabel,
  paymentMethodsForOrder,
} from "@/core/payments/paymentRules";
import { colors, commonStyles } from "@/shared/theme";
import {
  Button,
  CustomerShell,
  EmptyState,
  Loading,
  Notice,
} from "@/shared/ui";

export default function OrdersScreen() {
  const user = useAuthStore((state) => state.user)!;
  const connected = useNetworkStore((state) => state.isConnected);
  const client = useQueryClient();

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () =>
      cachedFetch<OrderResponse[]>("orders", user.id, veloraApi.orders),
  });

  const offline = useQuery({
    queryKey: ["offline-orders", user.id],
    queryFn: () => listOfflineOrders(user.id),
  });

  const sync = useMutation({
    mutationFn: () => syncOfflineOrders(user.id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["orders"] }),
        client.invalidateQueries({
          queryKey: ["offline-orders", user.id],
        }),
        client.invalidateQueries({ queryKey: ["cart", user.id] }),
      ]);
    },
  });

  const noOrders =
    !orders.isLoading &&
    (orders.data?.length ?? 0) === 0 &&
    (offline.data?.length ?? 0) === 0;

  return (
    <CustomerShell>
      <Text style={commonStyles.eyebrow}>MIS PEDIDOS</Text>
      <Text style={commonStyles.heading}>Compras y pagos.</Text>

      {!connected ? (
        <Notice kind="warning">
          Sin conexión. Los pedidos pendientes permanecen guardados en este
          dispositivo.
        </Notice>
      ) : null}

      {sync.data ? (
        <Notice kind="success">
          Sincronizados: {sync.data.synced}. Conflictos: {sync.data.conflicts}.
          Pendientes: {sync.data.pending}.
        </Notice>
      ) : null}
      {sync.isError ? (
        <Notice kind="error">
          {sync.error instanceof Error
            ? sync.error.message
            : "No fue posible sincronizar."}
        </Notice>
      ) : null}

      {(offline.data?.length ?? 0) > 0 ? (
        <>
          <View style={commonStyles.rowBetween}>
            <Text style={commonStyles.subheading}>Pedidos del dispositivo</Text>
            <Pressable
              disabled={!connected || sync.isPending}
              onPress={() => sync.mutate()}
            >
              <Text style={styles.link}>Sincronizar</Text>
            </Pressable>
          </View>
          <View style={{ gap: 10 }}>
            {offline.data?.map((entry) => (
              <OfflineOrderCard
                key={entry.id}
                entry={entry}
                onChanged={() =>
                  client.invalidateQueries({
                    queryKey: ["offline-orders", user.id],
                  })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {orders.isLoading ? <Loading label="Cargando pedidos…" /> : null}
      {orders.isError ? (
        <Notice kind="warning">
          {orders.error instanceof Error
            ? orders.error.message
            : "No fue posible consultar pedidos."}
        </Notice>
      ) : null}

      {noOrders ? (
        <EmptyState title="Todavía no tiene pedidos">
          Sus compras aparecerán aquí.
        </EmptyState>
      ) : (
        <View style={{ gap: 14 }}>
          {orders.data?.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </View>
      )}
    </CustomerShell>
  );
}

function OfflineOrderCard({
  entry,
  onChanged,
}: {
  entry: OfflineOrderEntry;
  onChanged: () => Promise<unknown> | void;
}) {
  return (
    <View style={commonStyles.card}>
      <View style={commonStyles.rowBetween}>
        <Text style={commonStyles.subheading}>
          {entry.status === "CONFLICT" ? "Requiere revisión" : "Pendiente"}
        </Text>
        <Text style={styles.status}>{entry.status}</Text>
      </View>
      <Text style={commonStyles.muted}>
        {entry.request.fulfillmentType} ·{" "}
        {entry.request.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
        unidades
      </Text>
      {entry.errorMessage ? (
        <Notice kind="error">{entry.errorMessage}</Notice>
      ) : null}
      <View style={{ gap: 8 }}>
        {entry.status === "CONFLICT" ? (
          <Button
            title="REINTENTAR"
            variant="secondary"
            onPress={() =>
              void retryOfflineOrder(entry.id).then(() => onChanged())
            }
          />
        ) : null}
        <Button
          title="DESCARTAR LOCAL"
          variant="danger"
          onPress={() =>
            Alert.alert(
              "Descartar pedido local",
              "Esta operación elimina únicamente la copia pendiente del dispositivo.",
              [
                { text: "Volver", style: "cancel" },
                {
                  text: "Descartar",
                  style: "destructive",
                  onPress: () =>
                    void deleteOfflineOrder(entry.id).then(() => onChanged()),
                },
              ],
            )
          }
        />
      </View>
    </View>
  );
}

function OrderCard({ order }: { order: OrderResponse }) {
  const client = useQueryClient();
  const connected = useNetworkStore((state) => state.isConnected);
  const [method, setMethod] = useState<PaymentMethod>(
    order.fulfillmentType === "DELIVERY" ? "COD" : "CASH",
  );

  const payments = useQuery({
    queryKey: ["payments", order.id],
    queryFn: () => veloraApi.paymentsForOrder(order.id),
    enabled: connected,
  });

  const activePayment =
    payments.data?.find(
      (payment) => payment.status === "PENDING" || payment.status === "PAID",
    ) ?? null;

  const createPayment = useMutation({
    mutationFn: async (selected: PaymentMethod) => {
      if (selected === "WEB") {
        const checkout = await veloraApi.stripeCheckoutMobile(order.id);
        await WebBrowser.openAuthSessionAsync(
          checkout.checkoutUrl,
          "velora://stripe-return",
        );
        return checkout.payment;
      }

      return veloraApi.createPayment(order.id, {
        method: selected,
        notes: `Pago ${selected} iniciado desde React Native.`,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["payments", order.id] }),
        client.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    },
  });

  const cancelPayment = useMutation({
    mutationFn: (payment: PaymentResponse) =>
      veloraApi.cancelPayment(payment.id, {
        reason: "Pago cancelado por el cliente desde React Native.",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["payments", order.id] }),
  });

  const cancelOrder = useMutation({
    mutationFn: () => veloraApi.cancelOrder(order.id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["orders"] }),
  });

  return (
    <View style={commonStyles.card}>
      <View style={commonStyles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.status}>{order.status}</Text>
          <Text style={commonStyles.subheading}>{order.orderNumber}</Text>
          <Text style={commonStyles.muted}>
            {order.storeName} · {order.fulfillmentType}
          </Text>
        </View>
        <Text style={styles.total}>
          {order.total.toFixed(2)} {order.currency}
        </Text>
      </View>

      <View style={commonStyles.divider} />
      {order.items.map((item) => (
        <View key={item.id} style={commonStyles.rowBetween}>
          <Text style={[commonStyles.body, { flex: 1 }]}>
            {item.productName} · {item.size}/{item.color} × {item.quantity}
          </Text>
          <Text style={commonStyles.muted}>{item.subtotal.toFixed(2)}</Text>
        </View>
      ))}

      {payments.isError ? (
        <Notice kind="warning">
          Los pagos se consultarán nuevamente al recuperar conexión.
        </Notice>
      ) : null}

      {payments.data?.map((payment) => (
        <View key={payment.id} style={styles.payment}>
          <View style={{ flex: 1 }}>
            <Text style={commonStyles.body}>
              {paymentMethodLabel(payment.method)}
            </Text>
            <Text style={commonStyles.muted}>{payment.status}</Text>
          </View>
          {payment.status === "PENDING" ? (
            <Pressable
              disabled={cancelPayment.isPending}
              onPress={() =>
                Alert.alert(
                  "Cancelar pago",
                  "El pedido continuará reservado y podrá elegir otro método.",
                  [
                    { text: "Volver", style: "cancel" },
                    {
                      text: "Cancelar pago",
                      style: "destructive",
                      onPress: () => cancelPayment.mutate(payment),
                    },
                  ],
                )
              }
            >
              <Text style={[styles.link, { color: colors.error }]}>
                Cancelar
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {order.status === "RESERVED" && !activePayment && connected ? (
        <>
          <Text style={commonStyles.label}>Método de pago</Text>
          <View style={styles.methods}>
            {paymentMethodsForOrder(order).map((option) => (
              <Pressable
                key={option}
                style={[
                  commonStyles.chip,
                  method === option && commonStyles.chipActive,
                ]}
                onPress={() => setMethod(option)}
              >
                <Text
                  style={[
                    commonStyles.chipText,
                    method === option && commonStyles.chipTextActive,
                  ]}
                >
                  {paymentMethodLabel(option)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            title={
              createPayment.isPending
                ? "PROCESANDO…"
                : method === "WEB"
                  ? "ABRIR STRIPE CHECKOUT"
                  : "REGISTRAR MÉTODO"
            }
            disabled={createPayment.isPending}
            onPress={() => createPayment.mutate(method)}
          />
        </>
      ) : null}

      {!connected ? (
        <Notice>
          Pagos y cancelaciones requieren conexión. El pedido permanece visible
          desde la caché local.
        </Notice>
      ) : null}

      {order.status === "RESERVED" && !activePayment && connected ? (
        <Button
          title="CANCELAR PEDIDO"
          variant="danger"
          disabled={cancelOrder.isPending}
          onPress={() =>
            Alert.alert(
              "Cancelar pedido",
              "Las unidades reservadas volverán a estar disponibles.",
              [
                { text: "Volver", style: "cancel" },
                {
                  text: "Cancelar pedido",
                  style: "destructive",
                  onPress: () => cancelOrder.mutate(),
                },
              ],
            )
          }
        />
      ) : null}

      <Button
        title="ACTUALIZAR ESTADO"
        variant="secondary"
        onPress={() =>
          void Promise.all([
            client.invalidateQueries({ queryKey: ["payments", order.id] }),
            client.invalidateQueries({ queryKey: ["orders"] }),
          ])
        }
      />
    </View>
  );
}


const styles = StyleSheet.create({
  status: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  total: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 17,
  },
  link: {
    color: colors.ink,
    fontWeight: "800",
  },
  payment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    padding: 12,
  },
  methods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
