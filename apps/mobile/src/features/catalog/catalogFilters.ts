import type { ProductResponse } from "@velora/contracts";

export type CatalogSort = "relevance" | "price-asc" | "price-desc" | "name";

export interface CatalogFilters {
  search: string;
  categoryId: string | null;
  size: string | null;
  color: string | null;
  sort: CatalogSort;
}

export const EMPTY_FILTERS: CatalogFilters = { search: "", categoryId: null, size: null, color: null, sort: "relevance" };

export const SORT_LABELS: Record<CatalogSort, string> = {
  relevance: "Destacados",
  "price-asc": "Precio: menor a mayor",
  "price-desc": "Precio: mayor a menor",
  name: "Nombre A-Z",
};

/** Precio más bajo de las variantes activas (Infinity si no hay). */
export function minPrice(product: ProductResponse): number {
  const prices = product.variants.filter((variant) => variant.active).map((variant) => variant.price);
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

/** Búsqueda (nombre, marca, categoría y descripción), categoría, talla, color y orden. */
export function filterProducts(products: readonly ProductResponse[], filters: CatalogFilters): ProductResponse[] {
  const term = filters.search.trim().toLocaleLowerCase("es");
  const list = products.filter((product) => {
    const variants = product.variants.filter((variant) => variant.active);
    return (!filters.categoryId || product.categoryId === filters.categoryId)
      && (!filters.size || variants.some((variant) => variant.size === filters.size))
      && (!filters.color || variants.some((variant) => variant.color === filters.color))
      && (!term || [product.name, product.brand, product.categoryName, product.description ?? ""].join(" ").toLocaleLowerCase("es").includes(term));
  });
  if (filters.sort === "price-asc") list.sort((a, b) => minPrice(a) - minPrice(b));
  else if (filters.sort === "price-desc") list.sort((a, b) => minPrice(b) - minPrice(a));
  else if (filters.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return list;
}

/** Tallas y colores presentes en el catálogo (para los filtros). */
export function variantOptions(products: readonly ProductResponse[]): { sizes: string[]; colors: string[] } {
  const sizes = new Set<string>(); const colors = new Set<string>();
  for (const product of products) for (const variant of product.variants) if (variant.active) { sizes.add(variant.size); colors.add(variant.color); }
  return { sizes: [...sizes].sort((a, b) => a.localeCompare(b, "es", { numeric: true })), colors: [...colors].sort((a, b) => a.localeCompare(b, "es")) };
}

export function activeFilterCount(filters: CatalogFilters): number {
  return [filters.categoryId, filters.size, filters.color, filters.search.trim() || null].filter(Boolean).length + (filters.sort === "relevance" ? 0 : 1);
}
