import { formatMoney } from "@velora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CompanyBrand } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";

/** Home de las tiendas que no son VÉLORA: su marca y productos destacados (sin contenido editorial de VÉLORA). */
export function GenericTenantHome({ brand }: { brand: CompanyBrand }) {
  const products = useQuery({ queryKey: ["public-products", brand.companyId], queryFn: () => veloraApi.publicProducts(brand.companyId) });
  const contact = brand.contact;
  return <main>
    <section className={brand.bannerUrl ? "tenant-hero with-banner" : "tenant-hero"} style={brand.bannerUrl ? { backgroundImage: `url(${brand.bannerUrl})` } : undefined}>
      <div><span className="eyebrow">{brand.name.toUpperCase()}</span><h1>{brand.tagline ?? `Bienvenida a ${brand.name}`}</h1><p>Descubre la colección, compra en línea y recoge en nuestra sucursal.</p><div className="actions"><Link className="button primary" to="/catalogo">Ver catálogo</Link><Link className="button secondary" to="/probador">Probador virtual</Link></div></div>
    </section>
    <section className="section"><div className="section-heading"><span className="eyebrow">DESTACADOS</span><h2>Lo nuevo de {brand.name}</h2></div>
      <div className="product-grid">{products.data?.slice(0, 8).map((product) => <Link className="product-card" to={`/catalogo/${product.slug}`} key={product.id}><div className="product-image">{product.images[0]?.imageUrl ? <img src={product.images[0].imageUrl} alt={product.images[0].altText ?? product.name} /> : <span>{product.name.slice(0, 1)}</span>}</div><div><small>{product.categoryName}</small><h3>{product.name}</h3><strong>{product.variants.length ? formatMoney(Math.min(...product.variants.map((variant) => variant.price))) : ""}</strong></div></Link>)}</div>
      {products.data?.length === 0 ? <Notice>Pronto publicaremos nuestra colección.</Notice> : null}
    </section>
    {contact && (contact.phone || contact.email || contact.address || contact.socials) ? <section className="section"><div className="section-heading"><span className="eyebrow">CONTACTO</span><h2>Visítanos</h2></div><div className="tenant-contact">{contact.address ? <span>{contact.address}</span> : null}{contact.phone ? <span>{contact.phone}</span> : null}{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}{Object.entries(contact.socials ?? {}).filter(([, value]) => value).map(([network, value]) => <span key={network}>{network}: {value}</span>)}</div></section> : null}
  </main>;
}
