import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import { useStorefrontBrand } from "../../core/company/useBrand";
import { GenericTenantHome } from "./GenericTenantHome";
import { HeroCarousel, LooksSection } from "./components";

/** /t/:slug → home de la tienda. VÉLORA conserva su home editorial (hero con fotos y looks); las demás, el genérico. */
export function HomePage() {
  const brand = useStorefrontBrand();
  if (brand && !brand.isPlatformBrand) return <GenericTenantHome brand={brand} />;
  return <VeloraHomePage />;
}

function VeloraHomePage() {
  const companyId = useCompanyStore((state) => state.storefrontCompanyId);
  const products = useQuery({ queryKey: ["public-products", companyId], queryFn: () => veloraApi.publicProducts(companyId!), enabled: Boolean(companyId) });
  return <main>
    <HeroCarousel><span className="eyebrow">NUEVA COLECCIÓN · 2026</span><h1>La elegancia no se sigue.<br />Se define.</h1><p>Moda femenina, catálogo compartido y una experiencia omnicanal preparada para acompañarte en cada sucursal.</p><div className="actions"><Link className="button primary" to="/catalogo">Descubrir colección</Link><Link className="button secondary" to="/probador">Probador virtual IA</Link></div></HeroCarousel>
    <LooksSection />
    <section className="section"><div className="section-heading"><span className="eyebrow">DESTACADOS</span><h2>Piezas elegidas para hoy</h2></div><div className="product-grid">{products.data?.slice(0, 6).map((product) => <Link className="product-card" to={`/catalogo/${product.slug}`} key={product.id}><div className="product-image">{product.images[0]?.imageUrl ? <img src={product.images[0].imageUrl} alt={product.images[0].altText ?? product.name} /> : <span>{product.name.slice(0, 1)}</span>}</div><div><small>{product.categoryName}</small><h3>{product.name}</h3><strong>{Math.min(...product.variants.map((variant) => variant.price)).toFixed(2)} BOB</strong></div></Link>)}</div>{companyId && products.data?.length === 0 ? <Notice>No hay productos activos en esta compañía todavía.</Notice> : null}</section>
    <section className="section feature-strip"><article><span>01</span><h3>Compra online</h3><p>Catálogo y bolsa conectados al inventario real.</p></article><article><span>02</span><h3>Recoge en sucursal</h3><p>PICKUP únicamente cuando el almacén principal cubre todo tu pedido.</p></article><article><span>03</span><h3>Compra offline</h3><p>Prepara tu pedido sin conexión y sincronízalo al volver a estar online.</p></article></section>
  </main>;
}
