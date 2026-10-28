import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { CategoryResponse, ProductResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { ProductCard } from "@/features/catalog/ProductCard";
import { resolveAssetUrl } from "@/shared/lib/productImages";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, CompanyLogo, CustomerShell, EmptyState, ErrorState, Loading, Notice } from "@/shared/ui";

interface HomeData { categories: CategoryResponse[]; products: ProductResponse[] }

/**
 * Home de la tienda activa: logo, nombre, tagline y banner de su marca, categorías y destacados.
 * Todo el contenido sale de los datos de la tienda (no hay textos editoriales fijos de ninguna marca).
 */
export default function HomeScreen() {
  return (
    <CustomerShell active="home">
      <CompanyGate><HomeContent /></CompanyGate>
    </CustomerShell>
  );
}

function HomeContent() {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const company = useCompanyStore((state) => state.companies.find((item) => item.id === state.selectedCompanyId) ?? null);
  const companyId = company?.id ?? null;
  const data = useQuery({
    queryKey: ["mobile-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => cachedFetch("catalog", companyId!, async (): Promise<HomeData> => {
      const [categories, products] = await Promise.all([veloraApi.categories(companyId!), veloraApi.products(companyId!)]);
      return { categories, products };
    }),
  });
  if (!company) return null;
  const brand = company.brand;
  const name = brand?.name ?? company.name;
  const categories = data.data?.categories.filter((category) => category.active) ?? [];
  // Destacados: productos con imagen y variantes activas (los primeros del catálogo de la tienda).
  const featured = (data.data?.products ?? []).filter((product) => product.images.length > 0 && product.variants.some((variant) => variant.active)).slice(0, 6);

  return (
    <>
      {!isConnected ? <Notice kind="warning">Estás sin conexión: ves lo último guardado. El stock se reserva recién al sincronizar.</Notice> : null}
      {brand?.bannerUrl ? (
        <Image source={{ uri: resolveAssetUrl(brand.bannerUrl) }} style={styles.banner} contentFit="cover" accessibilityLabel={`Portada de ${name}`} />
      ) : null}
      <View style={styles.brandBlock}>
        <CompanyLogo company={{ name, slug: brand?.slug ?? company.slug, logoUrl: brand?.logoUrl ?? null }} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={commonStyles.subheading} accessibilityRole="header" numberOfLines={2}>{name}</Text>
          {brand?.tagline ? <Text style={commonStyles.body}>{brand.tagline}</Text> : null}
        </View>
      </View>
      {user ? <Text style={commonStyles.muted}>Hola, {user.firstName}. Esto es lo nuevo en {name}.</Text> : null}

      {data.isLoading ? <Loading label="Cargando la tienda…" /> : null}
      {data.isError && !data.data ? <ErrorState message={data.error instanceof Error ? data.error.message : "No se pudo cargar la tienda."} onRetry={() => void data.refetch()} /> : null}

      {categories.length ? (
        <View style={{ gap: 10 }}>
          <Text style={commonStyles.eyebrow}>CATEGORÍAS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {categories.map((category) => (
              <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Ver ${category.name}`} style={commonStyles.chip} onPress={() => router.push({ pathname: "/catalog", params: { categoryId: category.id } } as never)}>
                <Text style={commonStyles.chipText}>{category.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {data.data ? (
        <View style={{ gap: 12 }}>
          <Text style={commonStyles.eyebrow}>DESTACADOS</Text>
          {featured.length ? featured.map((product) => <ProductCard key={product.id} product={product} />) : <EmptyState title="Aún no hay productos">Esta tienda está cargando su catálogo.</EmptyState>}
          <Button title="Ver todo el catálogo" onPress={() => router.push("/catalog" as never)} />
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button title="Mis pedidos" variant="secondary" onPress={() => router.push("/orders" as never)} />
        <Button title="Cambiar de tienda" variant="secondary" onPress={() => router.push("/stores" as never)} />
      </View>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  banner: { width: "100%", aspectRatio: 2.4, borderRadius: 18, backgroundColor: colors.surfaceSoft },
  brandBlock: { flexDirection: "row", alignItems: "center", gap: 14 },
}));
