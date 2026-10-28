import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { CategoryResponse, ProductResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { ProductCard } from "@/features/catalog/ProductCard";
import { activeFilterCount, EMPTY_FILTERS, filterProducts, SORT_LABELS, variantOptions, type CatalogFilters, type CatalogSort } from "@/features/catalog/catalogFilters";
import { useCommonStyles } from "@/shared/theme";
import { Button, CustomerShell, EmptyState, ErrorState, Field, Loading } from "@/shared/ui";

interface CatalogData {
  categories: CategoryResponse[];
  products: ProductResponse[];
}

export default function CatalogScreen() {
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const catalog = useQuery({
    queryKey: ["mobile-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => cachedFetch("catalog", companyId!, async (): Promise<CatalogData> => {
      const [categories, products] = await Promise.all([veloraApi.categories(companyId!), veloraApi.products(companyId!)]);
      return { categories, products };
    }),
  });
  return (
    <CustomerShell active="catalog" refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()}>
      <CompanyGate><CatalogContent catalog={catalog.data} loading={catalog.isLoading} error={catalog.isError && !catalog.data ? catalog.error : null} onRetry={() => void catalog.refetch()} /></CompanyGate>
    </CustomerShell>
  );
}

function CatalogContent({ catalog, loading, error, onRetry }: { catalog: CatalogData | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  const commonStyles = useCommonStyles();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const [filters, setFilters] = useState<CatalogFilters>({ ...EMPTY_FILTERS, categoryId: params.categoryId ?? null });
  const [showFilters, setShowFilters] = useState(false);
  const patch = (value: Partial<CatalogFilters>) => setFilters((current) => ({ ...current, ...value }));
  const products = useMemo(() => filterProducts(catalog?.products ?? [], filters), [catalog, filters]);
  const options = useMemo(() => variantOptions(catalog?.products ?? []), [catalog]);
  const count = activeFilterCount(filters);

  return (
    <>
      <Text style={commonStyles.eyebrow}>CATÁLOGO</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Encuentra tu próxima prenda</Text>
      <Field label="Buscar" value={filters.search} onChangeText={(search) => patch({ search })} placeholder="Vestido, zapatillas, chaqueta…" autoCapitalize="none" returnKeyType="search" />
      <ChipRow label="Categoría" value={filters.categoryId} all="Todas" options={(catalog?.categories ?? []).filter((category) => category.active).map((category) => [category.id, category.name])} onChange={(categoryId) => patch({ categoryId })} />
      <View style={commonStyles.rowBetween}>
        <Text style={commonStyles.muted} accessibilityLiveRegion="polite">{catalog ? `${products.length} de ${catalog.products.length} productos` : ""}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((value) => !value)} style={[commonStyles.chip, count > 0 && commonStyles.chipActive]}>
          <Text style={[commonStyles.chipText, count > 0 && commonStyles.chipTextActive]}>{showFilters ? "Ocultar filtros" : `Filtros y orden${count ? ` (${count})` : ""}`}</Text>
        </Pressable>
      </View>
      {showFilters ? (
        <View style={[commonStyles.card, { gap: 12 }]}>
          <ChipRow label="Talla" value={filters.size} all="Todas" options={options.sizes.map((size) => [size, size])} onChange={(size) => patch({ size })} />
          <ChipRow label="Color" value={filters.color} all="Todos" options={options.colors.map((color) => [color, color])} onChange={(color) => patch({ color })} />
          <ChipRow label="Ordenar" value={filters.sort} options={(Object.keys(SORT_LABELS) as CatalogSort[]).map((sort) => [sort, SORT_LABELS[sort]])} onChange={(sort) => patch({ sort: (sort ?? "relevance") as CatalogSort })} />
          {count ? <Button title="Quitar filtros" variant="secondary" onPress={() => setFilters(EMPTY_FILTERS)} /> : null}
        </View>
      ) : null}
      {loading ? <Loading label="Cargando catálogo…" /> : null}
      {error ? <ErrorState message={error instanceof Error ? error.message : "No fue posible cargar el catálogo."} onRetry={onRetry} /> : null}
      {catalog && products.length === 0 ? (
        <EmptyState title="No encontramos productos" actionTitle={count ? "Quitar filtros" : undefined} onAction={count ? () => setFilters(EMPTY_FILTERS) : undefined}>
          Prueba con otra categoría, talla o búsqueda.
        </EmptyState>
      ) : (
        <View style={{ gap: 14 }}>{products.map((product) => <ProductCard key={product.id} product={product} />)}</View>
      )}
    </>
  );
}

/** Fila de chips de un filtro (un solo valor; `all` = sin filtro). */
function ChipRow({ label, value, options, onChange, all }: { label: string; value: string | null; options: [string, string][]; onChange: (value: string | null) => void; all?: string }) {
  const commonStyles = useCommonStyles();
  if (!options.length) return null;
  const chips: [string | null, string][] = all ? [[null, all], ...options] : options;
  return (
    <View style={{ gap: 6 }}>
      <Text style={commonStyles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel={`Filtro: ${label}`}>
        {chips.map(([key, text]) => {
          const active = value === key;
          return (
            <Pressable key={key ?? "all"} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[commonStyles.chip, active && commonStyles.chipActive]}>
              <Text style={[commonStyles.chipText, active && commonStyles.chipTextActive]}>{text}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
