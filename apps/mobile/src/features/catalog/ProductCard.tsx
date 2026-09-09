import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { ProductResponse } from "@velora/contracts";
import { colors, commonStyles } from "@/shared/theme";

export function productPrice(product: ProductResponse): string {
  const active = product.variants.filter((variant) => variant.active);
  if (active.length === 0) {
    return "Sin precio disponible";
  }

  const minimum = Math.min(...active.map((variant) => variant.price));
  const currency = active[0]?.currency ?? "BOB";
  return `Desde ${minimum.toFixed(2)} ${currency}`;
}

export function primaryImage(product: ProductResponse): string | null {
  return (
    product.images.find((image) => image.primary)?.imageUrl ??
    product.images[0]?.imageUrl ??
    null
  );
}

export function ProductCard({ product }: { product: ProductResponse }) {
  const imageUrl = primaryImage(product);

  return (
    <Pressable
      style={({ pressed }) => [
        commonStyles.card,
        styles.card,
        pressed && { opacity: 0.78 },
      ]}
      onPress={() =>
        router.push({
          pathname: "/product/[id]",
          params: { id: product.id },
        } as never)
      }
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          transition={150}
          style={styles.image}
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={commonStyles.muted}>VÉLORA</Text>
        </View>
      )}

      <Text style={commonStyles.eyebrow}>{product.categoryName}</Text>
      <Text style={commonStyles.subheading}>{product.name}</Text>
      <Text style={commonStyles.muted}>{product.brand}</Text>
      <Text style={styles.price}>{productPrice(product)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
  },
  image: {
    width: "100%",
    aspectRatio: 0.86,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  price: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
});
