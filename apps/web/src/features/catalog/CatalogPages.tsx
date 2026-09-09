import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProductResponse, VariantResponse } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";

function price(product: ProductResponse): number { return product.variants.length ? Math.min(...product.variants.map((variant) => variant.price)) : 0; }
function primaryImage(product: ProductResponse): string | null { return product.images.find((image) => image.primary)?.imageUrl ?? product.images[0]?.imageUrl ?? null; }

export function CatalogPage() {
  const companyId = useCompanyStore((state) => state.storefrontCompanyId); const companies = useCompanyStore((state) => state.companies); const selectCompany = useCompanyStore((state) => state.selectStorefront);
  const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [size, setSize] = useState(""); const [color, setColor] = useState(""); const [sort, setSort] = useState("name");
  const productsQuery = useQuery({ queryKey: ["public-products", companyId], queryFn: () => veloraApi.publicProducts(companyId!), enabled: Boolean(companyId) });
  const categoriesQuery = useQuery({ queryKey: ["public-categories", companyId], queryFn: () => veloraApi.publicCategories(companyId!), enabled: Boolean(companyId) });
  const products = useMemo(() => {
    const term = search.trim().toLowerCase(); const list = [...(productsQuery.data ?? [])].filter((product) =>
      (!term || `${product.name} ${product.brand} ${product.description ?? ""}`.toLowerCase().includes(term)) &&
      (!category || product.categoryId === category) && (!size || product.variants.some((variant) => variant.size === size)) &&
      (!color || product.variants.some((variant) => variant.color === color)));
    list.sort((a, b) => sort === "price-asc" ? price(a) - price(b) : sort === "price-desc" ? price(b) - price(a) : a.name.localeCompare(b.name)); return list;
  }, [productsQuery.data, search, category, size, color, sort]);
  const sizes = useMemo(() => [...new Set((productsQuery.data ?? []).flatMap((product) => product.variants.map((variant) => variant.size)))].sort(), [productsQuery.data]);
  const colors = useMemo(() => [...new Set((productsQuery.data ?? []).flatMap((product) => product.variants.map((variant) => variant.color)))].sort(), [productsQuery.data]);
  if (!companyId) return <main className="section"><div className="section-heading"><span className="eyebrow">CATÁLOGO</span><h1>Seleccione una compañía</h1></div><div className="company-grid">{companies.map((company) => <button className="card choice" key={company.id} onClick={() => selectCompany(company.id)}><strong>{company.name}</strong><span>{company.description ?? company.code}</span></button>)}</div></main>;
  return <main className="section"><div className="section-heading"><span className="eyebrow">COLECCIÓN</span><h1>Catálogo VÉLORA</h1><p>Explore productos, variantes y precios del catálogo compartido de la compañía seleccionada.</p></div><div className="catalog-layout"><aside className="filters"><label>Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vestido, marca…" /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{categoriesQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Talla<select value={size} onChange={(event) => setSize(event.target.value)}><option value="">Todas</option>{sizes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Color<select value={color} onChange={(event) => setColor(event.target.value)}><option value="">Todos</option>{colors.map((item) => <option key={item}>{item}</option>)}</select></label><label>Orden<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Nombre</option><option value="price-asc">Precio ↑</option><option value="price-desc">Precio ↓</option></select></label></aside><section><div className="catalog-count">{products.length} productos</div><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</div>{!productsQuery.isLoading && products.length === 0 ? <Notice>No hay productos que coincidan con estos filtros.</Notice> : null}</section></div></main>;
}

function ProductCard({ product }: { product: ProductResponse }) {
  const image = primaryImage(product); return <Link className="product-card" to={`/catalogo/${product.slug}`}><div className="product-image">{image ? <img src={image} alt={product.name} /> : <span>{product.name.slice(0, 1)}</span>}</div><div><small>{product.categoryName}</small><h3>{product.name}</h3><p>{product.brand}</p><strong>{price(product).toFixed(2)} BOB</strong></div></Link>;
}

export function ProductDetailPage() {
  const { slug = "" } = useParams(); const navigate = useNavigate(); const client = useQueryClient(); const companyId = useCompanyStore((state) => state.storefrontCompanyId); const user = useAuthStore((state) => state.user);
  const [selectedVariantId, setSelectedVariantId] = useState(""); const [message, setMessage] = useState<string | null>(null);
  const products = useQuery({ queryKey: ["public-products", companyId], queryFn: () => veloraApi.publicProducts(companyId!), enabled: Boolean(companyId) });
  const product = products.data?.find((candidate) => candidate.slug === slug) ?? null;
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: veloraApi.favorites, enabled: user?.role === "CUSTOMER" });
  const selected = product?.variants.find((variant) => variant.id === selectedVariantId) ?? product?.variants[0] ?? null;
  const favorite = Boolean(product && favorites.data?.some((item) => item.productId === product.id));
  const cartMutation = useMutation({ mutationFn: (variant: VariantResponse) => veloraApi.addCartItem({ variantId: variant.id, quantity: 1 }), onSuccess: async () => { setMessage("Producto agregado a su bolsa."); await client.invalidateQueries({ queryKey: ["cart"] }); } });
  const favoriteMutation = useMutation({ mutationFn: async () => { if (!product) return; if (favorite) await veloraApi.removeFavorite(product.id); else await veloraApi.addFavorite(product.id); }, onSuccess: () => client.invalidateQueries({ queryKey: ["favorites"] }) });
  if (!companyId) return <main className="section"><Notice kind="error">Seleccione una compañía desde el catálogo.</Notice></main>;
  if (products.isLoading) return <main className="section">Cargando producto…</main>;
  if (!product) return <main className="section"><Notice kind="error">Producto no encontrado.</Notice></main>;
  const image = primaryImage(product);
  return <main className="section product-detail"><div className="detail-image">{image ? <img src={image} alt={product.name} /> : <span>{product.name.slice(0, 1)}</span>}</div><div className="detail-copy"><span className="eyebrow">{product.categoryName}</span><h1>{product.name}</h1><p>{product.description ?? "Diseño VÉLORA seleccionado para esta colección."}</p><div className="price-line">{selected ? `${selected.price.toFixed(2)} ${selected.currency}` : "Sin variantes"}</div><label>Variante<select value={selected?.id ?? ""} onChange={(event) => setSelectedVariantId(event.target.value)}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.size} · {variant.color} · {variant.price.toFixed(2)} {variant.currency}</option>)}</select></label>{message ? <Notice kind="success">{message}</Notice> : null}<div className="actions"><button className="button primary" disabled={!selected || cartMutation.isPending} onClick={() => { if (!user) navigate("/login", { state: { from: `/catalogo/${slug}` } }); else if (user.role === "CUSTOMER" && selected) cartMutation.mutate(selected); }}>Agregar a mi bolsa</button><button className="button secondary" disabled={user?.role !== "CUSTOMER" || favoriteMutation.isPending} onClick={() => favoriteMutation.mutate()}>{favorite ? "Quitar de favoritos" : "Guardar favorito"}</button></div><dl className="product-meta"><div><dt>Marca</dt><dd>{product.brand}</dd></div><div><dt>Composición</dt><dd>{product.composition ?? "—"}</dd></div><div><dt>Cuidado</dt><dd>{product.careInstructions ?? "—"}</dd></div></dl></div></main>;
}
