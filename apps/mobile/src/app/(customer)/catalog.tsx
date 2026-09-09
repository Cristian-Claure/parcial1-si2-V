import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { CategoryResponse, ProductResponse } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { ProductCard } from "@/features/catalog/ProductCard";
import { commonStyles } from "@/shared/theme";
import { CustomerShell, EmptyState, Field, Loading, Notice } from "@/shared/ui";

interface CatalogData {
  categories: CategoryResponse[];
  products: ProductResponse[];
}

export default function CatalogScreen() {
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["mobile-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CatalogData> => {
      const id = companyId!;
      return cachedFetch("catalog", id, async () => {
        const [categories, products] = await Promise.all([
          veloraApi.categories(id),
          veloraApi.products(id),
        ]);
        return { categories, products };
      });
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (catalog.data?.products ?? []).filter((product) => {
      const categoryMatch = !categoryId || product.categoryId === categoryId;
      const textMatch =
        !term ||
        [product.name, product.brand, product.categoryName, product.description ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term);
      return categoryMatch && textMatch;
    });
  }, [catalog.data, categoryId, search]);

  return (
    <CustomerShell active="catalog">
      <CompanyGate>
        <Text style={commonStyles.eyebrow}>CATÁLOGO</Text>
        <Text style={commonStyles.heading}>Encuentre su próxima pieza.</Text>
        <Field
          label="Buscar"
          value={search}
          onChangeText={setSearch}
          placeholder="Vestido, calzado, cartera…"
          autoCapitalize="none"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <CategoryChip
            label="Todo"
            active={categoryId === null}
            onPress={() => setCategoryId(null)}
          />
          {catalog.data?.categories
            .filter((category) => category.active)
            .map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                active={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
        </ScrollView>

        {catalog.isLoading ? <Loading label="Cargando catálogo…" /> : null}
        {catalog.isError ? (
          <Notice kind="error">
            {catalog.error instanceof Error
              ? catalog.error.message
              : "No fue posible cargar el catálogo."}
          </Notice>
        ) : null}

        {!catalog.isLoading && filtered.length === 0 ? (
          <EmptyState title="No encontramos productos">
            Pruebe otra categoría o término de búsqueda.
          </EmptyState>
        ) : (
          <View style={{ gap: 14 }}>
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        )}
      </CompanyGate>
    </CustomerShell>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        commonStyles.chip,
        active && commonStyles.chipActive,
      ]}
    >
      <Text
        style={[
          commonStyles.chipText,
          active && commonStyles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
