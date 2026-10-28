import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMoney, type CustomerFavoriteResponse, type ProductResponse, type VariantAvailabilityLevel, type VariantResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { useAuthStore } from "@/core/auth/authStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { saveCache } from "@/core/offline/mobileDb";
import { resolveAssetUrl } from "@/shared/lib/productImages";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, CustomerShell, EmptyState, ErrorState, Loading, Notice } from "@/shared/ui";

const LEVEL_LABELS: Record<VariantAvailabilityLevel, string> = { IN_STOCK: "Disponible", LOW: "Últimas unidades", OUT: "Agotado" };

export default function ProductDetailScreen() {
  return (
    <CustomerShell>
      <CompanyGate><ProductDetail /></CompanyGate>
    </CustomerShell>
  );
}

function ProductDetail() {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";
  const companyId = useCompanyStore((state) => state.selectedCompanyId)!;
  const user = useAuthStore((state) => state.user)!;
  const client = useQueryClient();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const product = useQuery({
    queryKey: ["mobile-product", companyId, productId],
    enabled: Boolean(productId),
    queryFn: () => cachedFetch<ProductResponse>("product", `${companyId}:${productId}`, () => veloraApi.product(companyId, productId)),
  });
  // Disponibilidad: solo un nivel por variante. Sin red se omite (el stock se valida al reservar).
  const availability = useQuery({
    queryKey: ["availability", companyId, productId],
    enabled: Boolean(productId),
    queryFn: () => veloraApi.availability(companyId, productId),
    retry: false,
  });
  const favorites = useQuery({
    queryKey: ["favorites", user.id],
    queryFn: () => cachedFetch<CustomerFavoriteResponse[]>("favorites", user.id, veloraApi.favorites),
  });

  const levels = useMemo(() => new Map((availability.data ?? []).map((item) => [item.variantId, item.level])), [availability.data]);
  const activeVariants = useMemo(() => product.data?.variants.filter((variant) => variant.active) ?? [], [product.data]);
  const firstAvailable = activeVariants.find((variant) => levels.get(variant.id) !== "OUT") ?? activeVariants[0] ?? null;
  const selectedVariant = activeVariants.find((variant) => variant.id === variantId) ?? firstAvailable;
  const selectedLevel = selectedVariant ? levels.get(selectedVariant.id) ?? null : null;
  const favorite = favorites.data?.some((item) => item.productId === productId) ?? false;

  const favoriteMutation = useMutation({
    mutationFn: async () => {
      if (favorite) await veloraApi.removeFavorite(productId); else await veloraApi.addFavorite(productId);
      return veloraApi.favorites();
    },
    onSuccess: async (value) => {
      await saveCache("favorites", user.id, value);
      client.setQueryData(["favorites", user.id], value);
      await client.invalidateQueries({ queryKey: ["mobile-favorites", user.id] });
      setMessage(favorite ? "Quitado de favoritos." : "Guardado en favoritos.");
    },
  });
  const cartMutation = useMutation({
    mutationFn: (variant: VariantResponse) => veloraApi.addCartItem({ companyId, variantId: variant.id, quantity: 1 }),
    onSuccess: async (cart) => {
      await saveCache("cart", `${user.id}:${companyId}`, cart);
      client.setQueryData(["cart", user.id, companyId], cart);
      setMessage("Agregado a la bolsa.");
    },
  });

  if (product.isLoading) return <Loading label="Cargando producto…" />;
  if (!product.data) {
    return (
      <View style={{ gap: 12 }}>
        <ErrorState message={product.error instanceof Error ? product.error.message : "El producto no está disponible."} onRetry={() => void product.refetch()} />
        <Button title="Volver al catálogo" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  const data = product.data;
  const error = cartMutation.error ?? favoriteMutation.error;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>← Volver</Text>
      </Pressable>
      <Gallery product={data} />
      <Text style={commonStyles.eyebrow}>{data.categoryName}</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">{data.name}</Text>
      <Text style={commonStyles.muted}>{data.brand}</Text>
      {selectedVariant ? <Text style={styles.price}>{formatMoney(selectedVariant.price, selectedVariant.currency)}</Text> : null}
      {data.description ? <Text style={commonStyles.body}>{data.description}</Text> : null}
      {message ? <Notice kind="success">{message}</Notice> : null}
      {error ? <Notice kind="error">{error instanceof Error ? error.message : "No fue posible completar la operación."}</Notice> : null}

      <Text style={commonStyles.subheading}>Talla y color</Text>
      {activeVariants.length === 0 ? <EmptyState title="Sin variantes disponibles" /> : (
        <View style={styles.variants}>
          {activeVariants.map((variant) => {
            const active = selectedVariant?.id === variant.id;
            const level = levels.get(variant.id);
            const out = level === "OUT";
            return (
              <Pressable
                key={variant.id}
                onPress={() => setVariantId(variant.id)}
                disabled={out}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: out }}
                accessibilityLabel={`Talla ${variant.size}, ${variant.color}, ${formatMoney(variant.price, variant.currency)}${level ? `, ${LEVEL_LABELS[level]}` : ""}`}
                style={[commonStyles.chip, styles.variant, active && commonStyles.chipActive, out && styles.variantOut]}
              >
                <Text style={[commonStyles.chipText, active && commonStyles.chipTextActive, out && styles.strike]}>{variant.size} · {variant.color}</Text>
                {level ? <Text style={[styles.level, active && commonStyles.chipTextActive]}>{LEVEL_LABELS[level]}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {selectedLevel === "LOW" ? <Notice kind="warning">Quedan pocas unidades de esta variante.</Notice> : null}
      <Button title={selectedLevel === "OUT" ? "Agotado" : "Agregar a la bolsa"} busy={cartMutation.isPending} disabled={!selectedVariant || selectedLevel === "OUT"} onPress={() => selectedVariant && cartMutation.mutate(selectedVariant)} />
      <Button title={favorite ? "Quitar de favoritos" : "Guardar en favoritos"} variant="secondary" busy={favoriteMutation.isPending} onPress={() => favoriteMutation.mutate()} />
      {data.tryOnEnabled ? <Button title="Probármelo en el probador virtual" variant="secondary" onPress={() => router.push({ pathname: "/try-on", params: { productId: data.id } } as never)} /> : null}
    </>
  );
}

/** Galería deslizable (una imagen por página) con indicador de posición. */
function Gallery({ product }: { product: ProductResponse }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const { width } = useWindowDimensions();
  const pageWidth = width - 40;
  const images = useMemo(() => [...product.images].sort((a, b) => Number(b.primary) - Number(a.primary) || a.sortOrder - b.sortOrder), [product.images]);
  const [index, setIndex] = useState(0);
  if (!images.length) return <View style={[styles.hero, styles.placeholder, { width: pageWidth }]}><Text style={commonStyles.muted}>Sin imagen</Text></View>;
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} accessibilityLabel={`Galería de ${product.name}: ${images.length} imágenes, desliza para ver más`}>
        {images.map((image, position) => (
          <Image key={image.id} source={{ uri: resolveAssetUrl(image.imageUrl) }} contentFit="cover" transition={150} style={[styles.hero, { width: pageWidth }]} accessibilityLabel={image.altText ?? `${product.name}, imagen ${position + 1} de ${images.length}`} />
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Imagen ${index + 1} de ${images.length}`}>
          {images.map((image, position) => <View key={image.id} style={[styles.dot, position === index && styles.dotActive]} />)}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.accentDeep },
  hero: { aspectRatio: 0.82, borderRadius: 22, backgroundColor: colors.surfaceSoft },
  placeholder: { alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.accent, width: 18 },
  price: { fontFamily: "Inter_800ExtraBold", fontSize: 20, color: colors.ink },
  variants: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  variant: { gap: 2, alignItems: "center" },
  variantOut: { opacity: 0.55 },
  strike: { textDecorationLine: "line-through" },
  level: { fontFamily: "Inter_400Regular", fontSize: 11, color: colors.inkSoft },
}));
