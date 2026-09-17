import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { EmptyState, Notice } from "../../shared/feedback/Notice";
import { ProductImagePlaceholder } from "../../shared/ui/ProductImagePlaceholder";

export function FavoritesPage() {
  const companyId = useCompanyStore((state) => state.storefrontCompanyId); const client = useQueryClient();
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: veloraApi.favorites });
  const products = useQuery({ queryKey: ["public-products", companyId], queryFn: () => veloraApi.publicProducts(companyId!), enabled: Boolean(companyId) });
  const remove = useMutation({ mutationFn: veloraApi.removeFavorite, onSuccess: () => client.invalidateQueries({ queryKey: ["favorites"] }) });
  const favoriteProducts = favorites.data?.map((favorite) => products.data?.find((product) => product.id === favorite.productId)).filter((product) => product !== undefined) ?? [];
  return <section className="page"><div className="page-heading"><span className="eyebrow">GUARDADOS</span><h1>Mis favoritos</h1><p>Productos que quiere conservar a mano.</p></div>{favorites.isError ? <Notice kind="error">No fue posible cargar sus favoritos.</Notice> : null}{!favorites.isLoading && favoriteProducts.length === 0 ? <EmptyState title="Todavía no hay favoritos">Explore el catálogo y guarde las piezas que le interesen.</EmptyState> : <div className="product-grid compact">{favoriteProducts.map((product) => <article className="product-card" key={product.id}><Link to={`/catalogo/${product.slug}`}><div className="product-image">{product.images[0]?.imageUrl ? <img src={product.images[0].imageUrl} alt={product.name} /> : <ProductImagePlaceholder />}<button type="button" className="quick-add-button" disabled={remove.isPending} onClick={(event) => { event.preventDefault(); event.stopPropagation(); remove.mutate(product.id); }}>{remove.isPending ? "Quitando…" : "Quitar de favoritos"}</button></div><div><small>{product.categoryName}</small><h3>{product.name}</h3></div></Link></article>)}</div>}</section>;
}
