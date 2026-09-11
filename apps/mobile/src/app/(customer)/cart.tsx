import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { CartResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { saveCache } from "@/core/offline/mobileDb";
import { colors, commonStyles } from "@/shared/theme";
import {
  Button,
  CustomerShell,
  EmptyState,
  Loading,
  Notice,
} from "@/shared/ui";

export default function CartScreen() {
  const user = useAuthStore((state) => state.user)!;
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const client = useQueryClient();
  const cartCacheKey = `${user.id}:${companyId ?? "none"}`;

  const cart = useQuery({
    queryKey: ["cart", user.id, companyId],
    enabled: Boolean(companyId),
    queryFn: () => cachedFetch<CartResponse>("cart", cartCacheKey, () => veloraApi.cart(companyId!)),
  });

  const applyCart = async (value: CartResponse) => {
    await saveCache("cart", cartCacheKey, value);
    client.setQueryData(["cart", user.id, companyId], value);
  };

  const update = useMutation({
    mutationFn: ({
      itemId,
      quantity,
    }: {
      itemId: string;
      quantity: number;
    }) => veloraApi.updateCartItem(itemId, { quantity }),
    onSuccess: applyCart,
  });

  const remove = useMutation({
    mutationFn: veloraApi.removeCartItem,
    onSuccess: applyCart,
  });

  const clear = useMutation({
    mutationFn: () => veloraApi.clearCart(companyId!),
    onSuccess: async () => {
      const empty: CartResponse = {
        id: null,
        status: "ACTIVE",
        items: [],
        totalItems: 0,
        subtotal: 0,
        currency: cart.data?.currency ?? "BOB",
      };
      await applyCart(empty);
    },
  });

  const error = update.error ?? remove.error ?? clear.error;

  if (!companyId) return <CustomerShell active="cart"><Notice kind="error">Seleccione una compañía antes de abrir su bolsa.</Notice></CustomerShell>;

  return (
    <CustomerShell active="cart">
      <Text style={commonStyles.eyebrow}>MI BOLSA</Text>
      <Text style={commonStyles.heading}>Su selección.</Text>
      <Text style={commonStyles.muted}>
        La bolsa no reserva inventario. La disponibilidad se valida al crear el
        pedido.
      </Text>

      {cart.isLoading ? <Loading label="Cargando bolsa…" /> : null}
      {cart.isError ? (
        <Notice kind="warning">
          {cart.error instanceof Error
            ? cart.error.message
            : "No fue posible consultar la bolsa."}
        </Notice>
      ) : null}
      {error ? (
        <Notice kind="error">
          {error instanceof Error
            ? error.message
            : "No fue posible actualizar la bolsa."}
        </Notice>
      ) : null}

      {cart.data && cart.data.items.length === 0 ? (
        <EmptyState title="Su bolsa está vacía">
          Explore el catálogo y agregue una variante.
        </EmptyState>
      ) : null}

      <View style={{ gap: 12 }}>
        {cart.data?.items.map((item) => (
          <View key={item.id} style={commonStyles.card}>
            <View style={commonStyles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={commonStyles.subheading}>{item.productName}</Text>
                <Text style={commonStyles.muted}>
                  {item.size} · {item.color} · {item.sku}
                </Text>
              </View>
              <Text style={styles.amount}>
                {item.subtotal.toFixed(2)} {item.currency}
              </Text>
            </View>

            <View style={styles.quantityRow}>
              <Pressable
                style={styles.quantityButton}
                disabled={item.quantity <= 1 || update.isPending}
                onPress={() =>
                  update.mutate({
                    itemId: item.id,
                    quantity: item.quantity - 1,
                  })
                }
              >
                <Text style={styles.quantityText}>−</Text>
              </Pressable>
              <Text style={styles.quantity}>{item.quantity}</Text>
              <Pressable
                style={styles.quantityButton}
                disabled={item.quantity >= 99 || update.isPending}
                onPress={() =>
                  update.mutate({
                    itemId: item.id,
                    quantity: item.quantity + 1,
                  })
                }
              >
                <Text style={styles.quantityText}>+</Text>
              </Pressable>
            </View>

            <Button
              title="QUITAR"
              variant="secondary"
              disabled={remove.isPending}
              onPress={() => remove.mutate(item.id)}
            />
          </View>
        ))}
      </View>

      {cart.data && cart.data.items.length > 0 ? (
        <>
          <View style={commonStyles.card}>
            <View style={commonStyles.rowBetween}>
              <Text style={commonStyles.subheading}>Total</Text>
              <Text style={styles.total}>
                {cart.data.subtotal.toFixed(2)} {cart.data.currency}
              </Text>
            </View>
            <Text style={commonStyles.muted}>
              {cart.data.totalItems} unidades
            </Text>
          </View>

          <Button
            title="CONTINUAR AL CHECKOUT"
            onPress={() => router.push("/checkout" as never)}
          />
          <Button
            title="VACIAR BOLSA"
            variant="danger"
            disabled={clear.isPending}
            onPress={() =>
              Alert.alert(
                "Vaciar bolsa",
                "¿Desea eliminar todos los productos de su bolsa?",
                [
                  { text: "Volver", style: "cancel" },
                  {
                    text: "Vaciar",
                    style: "destructive",
                    onPress: () => clear.mutate(),
                  },
                ],
              )
            }
          />
        </>
      ) : null}
    </CustomerShell>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: colors.ink,
    fontWeight: "800",
  },
  total: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 20,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  quantityButton: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
  },
  quantityText: {
    fontSize: 22,
    color: colors.ink,
  },
  quantity: {
    width: 44,
    textAlign: "center",
    fontWeight: "800",
    color: colors.ink,
  },
});
