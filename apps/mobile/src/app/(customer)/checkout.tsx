import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CartResponse,
  CheckoutWarehouseResponse,
  CustomerAddressResponse,
  CustomerFulfillmentType,
} from "@velora/contracts";
import { isConnectivityError } from "@/core/api/apiClient";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import {
  enqueueOfflineOrder,
  saveCache,
} from "@/core/offline/mobileDb";
import { buildOfflineOrder } from "@/core/offline/offlineOrder";
import { colors, commonStyles } from "@/shared/theme";
import {
  Button,
  CustomerShell,
  EmptyState,
  Field,
  Loading,
  Notice,
} from "@/shared/ui";

interface CheckoutData {
  cart: CartResponse;
  warehouses: CheckoutWarehouseResponse[];
  addresses: CustomerAddressResponse[];
}

export default function CheckoutScreen() {
  const user = useAuthStore((state) => state.user)!;
  const connected = useNetworkStore((state) => state.isConnected);
  const client = useQueryClient();
  const [fulfillmentType, setFulfillmentType] =
    useState<CustomerFulfillmentType>("PICKUP");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [offlineSaved, setOfflineSaved] = useState(false);

  const checkout = useQuery({
    queryKey: ["mobile-checkout", user.id],
    queryFn: async (): Promise<CheckoutData> =>
      cachedFetch("checkout", user.id, async () => {
        const [cart, warehouses, addresses] = await Promise.all([
          veloraApi.cart(),
          veloraApi.checkoutWarehouses(),
          veloraApi.addresses(),
        ]);
        await saveCache("cart", user.id, cart);
        await saveCache("addresses", user.id, addresses);
        return { cart, warehouses, addresses };
      }),
  });

  const defaultAddress =
    checkout.data?.addresses.find((address) => address.defaultAddress) ??
    checkout.data?.addresses[0] ??
    null;

  const effectiveWarehouseId =
    warehouseId ?? checkout.data?.warehouses[0]?.warehouseId ?? null;
  const effectiveAddressId = addressId ?? defaultAddress?.id ?? null;

  const selectedWarehouse = useMemo(
    () =>
      checkout.data?.warehouses.find(
        (warehouse) => warehouse.warehouseId === effectiveWarehouseId,
      ) ?? null,
    [checkout.data?.warehouses, effectiveWarehouseId],
  );

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!checkout.data || !effectiveWarehouseId) {
        throw new Error("Seleccione una sucursal elegible.");
      }

      if (checkout.data.cart.items.length === 0) {
        throw new Error("Su bolsa está vacía.");
      }

      if (fulfillmentType === "DELIVERY" && !effectiveAddressId) {
        throw new Error("Seleccione una dirección de entrega.");
      }

      const address =
        fulfillmentType === "DELIVERY" ? effectiveAddressId : null;

      if (!connected) {
        const request = buildOfflineOrder({
          cart: checkout.data.cart,
          warehouseId: effectiveWarehouseId,
          fulfillmentType,
          addressId: address,
          notes: notes.trim() || null,
        });
        await enqueueOfflineOrder(user.id, request);
        return { offline: true as const };
      }

      try {
        const order = await veloraApi.createOrder({
          warehouseId: effectiveWarehouseId,
          fulfillmentType,
          addressId: address,
          notes: notes.trim() || null,
        });

        return { offline: false as const, order };
      } catch (error) {
        if (!isConnectivityError(error)) {
          throw error;
        }

        const request = buildOfflineOrder({
          cart: checkout.data.cart,
          warehouseId: effectiveWarehouseId,
          fulfillmentType,
          addressId: address,
          notes: notes.trim() || null,
        });
        await enqueueOfflineOrder(user.id, request);
        return { offline: true as const };
      }
    },
    onSuccess: async (result) => {
      if (result.offline) {
        setOfflineSaved(true);
        await client.invalidateQueries({
          queryKey: ["offline-orders", user.id],
        });
      } else {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["orders"] }),
          client.invalidateQueries({ queryKey: ["cart", user.id] }),
        ]);
      }

      router.replace("/orders" as never);
    },
  });

  if (checkout.isLoading) {
    return (
      <CustomerShell>
        <Loading label="Preparando checkout…" />
      </CustomerShell>
    );
  }

  if (!checkout.data) {
    return (
      <CustomerShell>
        <Notice kind="error">
          {checkout.error instanceof Error
            ? checkout.error.message
            : "No existe contexto de checkout guardado."}
        </Notice>
        <Button
          title="VOLVER A LA BOLSA"
          variant="secondary"
          onPress={() => router.replace("/cart" as never)}
        />
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <Text style={commonStyles.eyebrow}>CHECKOUT</Text>
      <Text style={commonStyles.heading}>Entrega o retiro.</Text>

      {!connected ? (
        <Notice kind="warning">
          Modo offline: el pedido quedará pendiente en este dispositivo. No se
          reservará stock ni se creará ningún pago hasta sincronizar.
        </Notice>
      ) : null}
      {offlineSaved ? (
        <Notice kind="success">Pedido offline guardado correctamente.</Notice>
      ) : null}
      {createOrder.isError ? (
        <Notice kind="error">
          {createOrder.error instanceof Error
            ? createOrder.error.message
            : "No fue posible crear el pedido."}
        </Notice>
      ) : null}

      <Text style={commonStyles.subheading}>1. Modalidad</Text>
      <View style={styles.choiceRow}>
        <Choice
          label="Retiro"
          detail="Almacén principal"
          active={fulfillmentType === "PICKUP"}
          onPress={() => setFulfillmentType("PICKUP")}
        />
        <Choice
          label="Entrega"
          detail="Dirección guardada"
          active={fulfillmentType === "DELIVERY"}
          onPress={() => setFulfillmentType("DELIVERY")}
        />
      </View>

      <Text style={commonStyles.subheading}>2. Sucursal elegible</Text>
      <Text style={commonStyles.muted}>
        Para PICKUP solo aparecen almacenes principales que pueden cubrir toda
        su bolsa.
      </Text>

      {checkout.data.warehouses.length === 0 ? (
        <EmptyState title="No hay sucursales elegibles">
          Revise disponibilidad o cambie las cantidades de su bolsa.
        </EmptyState>
      ) : (
        <View style={{ gap: 8 }}>
          {checkout.data.warehouses.map((warehouse) => {
            const active = warehouse.warehouseId === effectiveWarehouseId;
            return (
              <Pressable
                key={warehouse.warehouseId}
                onPress={() => setWarehouseId(warehouse.warehouseId)}
                style={[
                  commonStyles.card,
                  active && styles.selectedCard,
                ]}
              >
                <Text style={commonStyles.subheading}>{warehouse.storeName}</Text>
                <Text style={commonStyles.body}>{warehouse.warehouseName}</Text>
                {warehouse.storeAddress ? (
                  <Text style={commonStyles.muted}>
                    {warehouse.storeAddress}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {fulfillmentType === "DELIVERY" ? (
        <>
          <Text style={commonStyles.subheading}>3. Dirección</Text>
          {checkout.data.addresses.length === 0 ? (
            <>
              <Notice kind="error">
                Necesita una dirección guardada para solicitar entrega.
              </Notice>
              <Button
                title="AGREGAR DIRECCIÓN"
                variant="secondary"
                onPress={() => router.push("/account" as never)}
              />
            </>
          ) : (
            <View style={{ gap: 8 }}>
              {checkout.data.addresses.map((address) => {
                const active = address.id === effectiveAddressId;
                return (
                  <Pressable
                    key={address.id}
                    onPress={() => setAddressId(address.id)}
                    style={[
                      commonStyles.card,
                      active && styles.selectedCard,
                    ]}
                  >
                    <Text style={commonStyles.subheading}>{address.label}</Text>
                    <Text style={commonStyles.body}>{address.addressLine}</Text>
                    <Text style={commonStyles.muted}>
                      {address.city} · {address.recipientName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      <Field
        label="Observaciones"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={500}
        placeholder="Opcional"
      />

      <View style={commonStyles.card}>
        <View style={commonStyles.rowBetween}>
          <Text style={commonStyles.subheading}>Total</Text>
          <Text style={styles.total}>
            {checkout.data.cart.subtotal.toFixed(2)}{" "}
            {checkout.data.cart.currency}
          </Text>
        </View>
        <Text style={commonStyles.muted}>
          {checkout.data.cart.totalItems} unidades
          {selectedWarehouse ? ` · ${selectedWarehouse.storeName}` : ""}
        </Text>
      </View>

      <Button
        title={
          createOrder.isPending
            ? "PROCESANDO…"
            : connected
              ? "CONFIRMAR PEDIDO"
              : "GUARDAR PEDIDO OFFLINE"
        }
        disabled={
          createOrder.isPending ||
          !effectiveWarehouseId ||
          (fulfillmentType === "DELIVERY" && !effectiveAddressId)
        }
        onPress={() => createOrder.mutate()}
      />
    </CustomerShell>
  );
}

function Choice({
  label,
  detail,
  active,
  onPress,
}: {
  label: string;
  detail: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        commonStyles.card,
        styles.choice,
        active && styles.selectedCard,
      ]}
    >
      <Text style={commonStyles.subheading}>{label}</Text>
      <Text style={commonStyles.muted}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  choice: {
    flex: 1,
  },
  selectedCard: {
    borderColor: colors.ink,
    borderWidth: 2,
  },
  total: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 20,
  },
});
