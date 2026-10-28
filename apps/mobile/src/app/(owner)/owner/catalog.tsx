import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { formatMoney, type ProductResponse } from "@velora/contracts";
import { useOwnerCompany } from "@/core/company/ownerStore";
import { Chips } from "@/features/owner/OrdersPanel";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { useManagedProducts } from "@/features/owner/ownerQueries";
import { minPrice } from "@/features/catalog/catalogFilters";
import { primaryImage } from "@/shared/lib/productImages";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, ErrorState, Field, Loading } from "@/shared/ui";

const STATUS_LABELS: Record<string, string> = { ACTIVE: "Activo", INACTIVE: "Inactivo", DRAFT: "Borrador" };
const PAGE = 20;


/** Catálogo del propietario: lista con búsqueda y estado; el detalle permite activar/desactivar y editar precios. */
export default function OwnerCatalogScreen() {
  const commonStyles = useCommonStyles();
  const company = useOwnerCompany();
  const products = useManagedProducts(company?.id ?? null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return (products.data ?? []).filter((product) => (!status || product.status === status)
      && (!term || `${product.name} ${product.categoryName} ${product.variants.map((variant) => variant.sku).join(" ")}`.toLocaleLowerCase("es").includes(term)));
  }, [products.data, search, status]);

  return (
    <OwnerShell active="catalog" refreshing={products.isRefetching} onRefresh={() => void products.refetch()}>
      <Text style={commonStyles.eyebrow}>CATÁLOGO</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Tus productos</Text>
      <Field label="Buscar" value={search} onChangeText={(value) => { setSearch(value); setLimit(PAGE); }} placeholder="Nombre, categoría o SKU" autoCapitalize="none" returnKeyType="search" />
      <Chips label="Estado" options={[["", "Todos"], ["ACTIVE", "Activos"], ["INACTIVE", "Inactivos"], ["DRAFT", "Borradores"]]} value={status} onChange={(value) => { setStatus(value); setLimit(PAGE); }} />
      <Button title="Registrar producto" variant="secondary" onPress={() => router.push("/owner/register-product" as never)} />
      {products.isLoading ? <Loading label="Cargando productos…" /> : null}
      {products.isError && !products.data ? <ErrorState message={products.error instanceof Error ? products.error.message : "No se pudieron cargar los productos."} onRetry={() => void products.refetch()} /> : null}
      {products.data ? <Text style={commonStyles.muted}>{filtered.length} productos</Text> : null}
      {products.data && filtered.length === 0 ? <EmptyState title="Sin productos">Cambia la búsqueda o registra uno nuevo.</EmptyState> : null}
      {filtered.slice(0, limit).map((product) => <ProductRow key={product.id} product={product} />)}
      {filtered.length > limit ? <Button title={`Mostrar más (${filtered.length - limit})`} variant="secondary" onPress={() => setLimit((value) => value + PAGE)} /> : null}
    </OwnerShell>
  );
}

function ProductRow({ product }: { product: ProductResponse }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const image = primaryImage(product);
  const price = minPrice(product);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${STATUS_LABELS[product.status] ?? product.status}`} onPress={() => router.push({ pathname: "/owner/product/[id]", params: { id: product.id } } as never)} style={({ pressed }) => [commonStyles.card, styles.row, pressed && { opacity: 0.8 }]}>
      {image ? <Image source={{ uri: image }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, styles.placeholder]} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <Text style={commonStyles.muted} numberOfLines={1}>{product.categoryName} · {product.variants.length} variantes</Text>
        <Text style={commonStyles.muted}>{Number.isFinite(price) ? `Desde ${formatMoney(price)}` : "Sin precio"}</Text>
      </View>
      <Text style={[styles.status, product.status !== "ACTIVE" && styles.statusOff]}>{STATUS_LABELS[product.status] ?? product.status}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceSoft },
  placeholder: { borderWidth: 1, borderColor: colors.hairline },
  name: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.ink },
  status: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.success },
  statusOff: { color: colors.inkSoft },
}));
