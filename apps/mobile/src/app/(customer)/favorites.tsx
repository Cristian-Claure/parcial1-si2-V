import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type {
  CustomerFavoriteResponse,
  ProductResponse,
} from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { useAuthStore } from "@/core/auth/authStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { CompanyGate } from "@/features/company/CompanyGate";
import { ProductCard } from "@/features/catalog/ProductCard";
import { commonStyles } from "@/shared/theme";
import { CustomerShell, EmptyState, Loading, Notice } from "@/shared/ui";

interface FavoriteData {
  favorites: CustomerFavoriteResponse[];
  products: ProductResponse[];
}

export default function FavoritesScreen() {
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const user = useAuthStore((state) => state.user)!;

  const query = useQuery({
    queryKey: ["mobile-favorites", user.id, companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<FavoriteData> => {
      const id = companyId!;
      return cachedFetch("favorite-products", `${user.id}:${id}`, async () => {
        const [favorites, products] = await Promise.all([
          veloraApi.favorites(),
          veloraApi.products(id),
        ]);
        return { favorites, products };
      });
    },
  });

  const favoriteIds = new Set(
    query.data?.favorites.map((favorite) => favorite.productId) ?? [],
  );
  const products =
    query.data?.products.filter((product) => favoriteIds.has(product.id)) ?? [];

  return (
    <CustomerShell active="favorites">
      <CompanyGate>
        <Text style={commonStyles.eyebrow}>FAVORITOS</Text>
        <Text style={commonStyles.heading}>Piezas que quiere volver a ver.</Text>

        {query.isLoading ? <Loading /> : null}
        {query.isError ? (
          <Notice kind="error">
            {query.error instanceof Error
              ? query.error.message
              : "No fue posible consultar favoritos."}
          </Notice>
        ) : null}

        {!query.isLoading && products.length === 0 ? (
          <EmptyState title="Aún no tiene favoritos">
            Guarde productos desde el catálogo para encontrarlos aquí.
          </EmptyState>
        ) : (
          <View style={{ gap: 14 }}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        )}
      </CompanyGate>
    </CustomerShell>
  );
}
