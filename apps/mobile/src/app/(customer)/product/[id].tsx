import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CustomerFavoriteResponse,
  ProductResponse,
  VariantResponse,
} from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { useAuthStore } from "@/core/auth/authStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { saveCache } from "@/core/offline/mobileDb";
import { primaryImage } from "@/features/catalog/ProductCard";
import { colors, commonStyles } from "@/shared/theme";
import {
  Button,
  CustomerShell,
  EmptyState,
  Loading,
  Notice,
} from "@/shared/ui";

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const user = useAuthStore((state) => state.user)!;
  const client = useQueryClient();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const product = useQuery({
    queryKey: ["mobile-product", companyId, productId],
    enabled: Boolean(companyId && productId),
    queryFn: () =>
      cachedFetch<ProductResponse>(
        "product",
        `${companyId}:${productId}`,
        () => veloraApi.product(companyId!, productId),
      ),
  });

  const favorites = useQuery({
    queryKey: ["favorites", user.id],
    queryFn: () =>
      cachedFetch<CustomerFavoriteResponse[]>(
        "favorites",
        user.id,
        veloraApi.favorites,
      ),
  });

  const activeVariants = useMemo(
    () => product.data?.variants.filter((variant) => variant.active) ?? [],
    [product.data],
  );
  const selectedVariant =
    activeVariants.find((variant) => variant.id === variantId) ??
    activeVariants[0] ??
    null;

  const favorite =
    favorites.data?.some((item) => item.productId === productId) ?? false;

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (favorite) {
        await veloraApi.removeFavorite(productId);
      } else {
        await veloraApi.addFavorite(productId);
      }
      return veloraApi.favorites();
    },
    onSuccess: async (value) => {
      await saveCache("favorites", user.id, value);
      client.setQueryData(["favorites", user.id], value);
      await client.invalidateQueries({ queryKey: ["mobile-favorites", user.id] });
      setMessage(favorite ? "Eliminado de favoritos." : "Agregado a favoritos.");
    },
  });

  const cartMutation = useMutation({
    mutationFn: async (variant: VariantResponse) =>
      veloraApi.addCartItem({ companyId: companyId!, variantId: variant.id, quantity: 1 }),
    onSuccess: async (cart) => {
      const cartCacheKey = `${user.id}:${companyId}`;
      await saveCache("cart", cartCacheKey, cart);
      client.setQueryData(["cart", user.id, companyId], cart);
      setMessage("Producto agregado a la bolsa.");
    },
  });

  if (!companyId) {
    return (
      <CustomerShell>
        <CompanyGate>
          <Loading label="Preparando catálogo…" />
        </CompanyGate>
      </CustomerShell>
    );
  }

  if (product.isLoading) {
    return (
      <CustomerShell>
        <Loading label="Cargando producto…" />
      </CustomerShell>
    );
  }

  if (!product.data) {
    return (
      <CustomerShell>
        <Notice kind="error">El producto no está disponible.</Notice>
        <Button
          title="VOLVER AL CATÁLOGO"
          variant="secondary"
          onPress={() => router.back()}
        />
      </CustomerShell>
    );
  }

  const imageUrl = primaryImage(product.data);

  return (
    <CustomerShell>
      <Button title="← VOLVER" variant="secondary" onPress={() => router.back()} />

      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          transition={150}
          style={styles.hero}
        />
      ) : (
        <View style={[styles.hero, styles.placeholder]}>
          <Text style={commonStyles.muted}>VÉLORA</Text>
        </View>
      )}

      <Text style={commonStyles.eyebrow}>{product.data.categoryName}</Text>
      <Text style={commonStyles.heading}>{product.data.name}</Text>
      <Text style={commonStyles.muted}>{product.data.brand}</Text>
      {product.data.description ? (
        <Text style={commonStyles.body}>{product.data.description}</Text>
      ) : null}

      {message ? <Notice kind="success">{message}</Notice> : null}
      {cartMutation.isError || favoriteMutation.isError ? (
        <Notice kind="error">
          {(cartMutation.error ?? favoriteMutation.error) instanceof Error
            ? (cartMutation.error ?? favoriteMutation.error)?.message
            : "No fue posible completar la operación."}
        </Notice>
      ) : null}

      <Text style={commonStyles.subheading}>Talla y color</Text>
      {activeVariants.length === 0 ? (
        <EmptyState title="Sin variantes disponibles" />
      ) : (
        <View style={styles.variants}>
          {activeVariants.map((variant) => {
            const active = selectedVariant?.id === variant.id;
            return (
              <Pressable
                key={variant.id}
                onPress={() => setVariantId(variant.id)}
                style={[
                  commonStyles.chip,
                  styles.variant,
                  active && commonStyles.chipActive,
                ]}
              >
                <Text
                  style={[
                    commonStyles.chipText,
                    active && commonStyles.chipTextActive,
                  ]}
                >
                  {variant.size} · {variant.color}
                </Text>
                <Text
                  style={[
                    commonStyles.muted,
                    active && { color: colors.ivory },
                  ]}
                >
                  {variant.price.toFixed(2)} {variant.currency}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Button
        title={favorite ? "QUITAR DE FAVORITOS" : "GUARDAR EN FAVORITOS"}
        variant="secondary"
        disabled={favoriteMutation.isPending}
        onPress={() => favoriteMutation.mutate()}
      />
      <Button
        title="AGREGAR A LA BOLSA"
        disabled={!selectedVariant || cartMutation.isPending}
        onPress={() => {
          if (selectedVariant) {
            cartMutation.mutate(selectedVariant);
          }
        }}
      />

      {product.data.tryOnEnabled ? (
        <Notice>
          Este producto admite Probador Virtual. La experiencia se habilitará en
          N9 junto con IA y Azure Blob.
        </Notice>
      ) : null}
    </CustomerShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    aspectRatio: 0.82,
    borderRadius: 22,
    backgroundColor: colors.surfaceSoft,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  variants: {
    gap: 8,
  },
  variant: {
    gap: 4,
  },
});
