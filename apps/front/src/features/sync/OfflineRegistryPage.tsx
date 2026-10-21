import { useCallback, useEffect, useState, type FormEvent } from "react";
import { syncCustomerCreateSchema, syncProductCreateSchema, type SyncCategory, type SyncCustomer, type SyncProduct, type SyncWarehouse } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { offlineDb } from "../../core/offline/offlineDb";
import { enqueueCustomer, enqueueProduct, runOperationsSync, useSyncStatus } from "../../core/sync/syncEngine";
import type { MirrorRecord } from "../../core/sync/types";
import { useOperationalCompanyId } from "../../core/sync/useOperationalContext";
import { Notice } from "../../shared/feedback/Notice";

interface VariantDraft { key: string; size: string; color: string; sku: string; price: string; stock: string }
const emptyVariant = (): VariantDraft => ({ key: crypto.randomUUID(), size: "", color: "", sku: "", price: "", stock: "" });
const emptyCustomer = { firstName: "", lastName: "", phone: "", email: "", taxId: "", customerType: "B2C" as "B2C" | "B2B", businessName: "" };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Revise los datos ingresados.";
}

/** Registro de clientes y productos que funciona sin red (se encolan y sincronizan después). */
export function OfflineRegistryPage() {
  const user = useAuthStore((state) => state.user)!;
  const companyId = useOperationalCompanyId();
  const online = useSyncStatus((state) => state.online);
  const [tab, setTab] = useState<"customer" | "product">("customer");
  const [records, setRecords] = useState<MirrorRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [product, setProduct] = useState({ name: "", categoryId: "", description: "", warehouseId: "" });
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [image, setImage] = useState<File | null>(null);

  const load = useCallback(async () => { setRecords(companyId ? await offlineDb.mirror.where("companyId").equals(companyId).toArray() : []); }, [companyId]);
  useEffect(() => {
    const refresh = () => { void load(); };
    refresh();
    window.addEventListener("velora:sync-changed", refresh);
    return () => window.removeEventListener("velora:sync-changed", refresh);
  }, [load]);

  const of = <T,>(type: MirrorRecord["entityType"]) => records.filter((record) => record.entityType === type).map((record) => ({ ...(record.data as unknown as T), pending: record.pending }));
  const categories = of<SyncCategory>("CATEGORY");
  const warehouses = of<SyncWarehouse>("WAREHOUSE");
  const customers = of<SyncCustomer>("CUSTOMER").sort((a, b) => Number(b.pending) - Number(a.pending));
  const products = of<SyncProduct>("PRODUCT").sort((a, b) => Number(b.pending) - Number(a.pending));
  const afterEnqueue = async (text: string) => { setMessage(online ? `${text} Sincronizando…` : `${text} Se enviará al reconectar.`); await load(); if (online) void runOperationsSync(user, companyId); };

  const submitCustomer = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null);
    if (!companyId) return;
    const parsed = syncCustomerCreateSchema.safeParse({
      id: crypto.randomUUID(), firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone || null, email: customer.email || null,
      taxId: customer.taxId || null, customerType: customer.customerType, businessName: customer.customerType === "B2B" ? customer.businessName || null : null,
    });
    if (!parsed.success) { setError(firstIssue(parsed.error)); return; }
    await enqueueCustomer(companyId, user.id, parsed.data);
    setCustomer(emptyCustomer);
    await afterEnqueue(`Cliente ${parsed.data.firstName} ${parsed.data.lastName} registrado.`);
  };

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null);
    if (!companyId) return;
    const withIds = variants.map((variant) => ({ ...variant, id: crypto.randomUUID() }));
    const parsed = syncProductCreateSchema.safeParse({
      id: crypto.randomUUID(), categoryId: product.categoryId, name: product.name, description: product.description || null,
      variants: withIds.map((variant) => ({ id: variant.id, sku: variant.sku, size: variant.size, color: variant.color, price: Number(variant.price) })),
      initialStock: product.warehouseId ? withIds.filter((variant) => Number(variant.stock) > 0).map((variant) => ({ variantId: variant.id, warehouseId: product.warehouseId, quantity: Number(variant.stock) })) : undefined,
    });
    if (!parsed.success) { setError(firstIssue(parsed.error)); return; }
    await enqueueProduct(companyId, user.id, parsed.data, image);
    setProduct({ name: "", categoryId: product.categoryId, description: "", warehouseId: product.warehouseId }); setVariants([emptyVariant()]); setImage(null);
    await afterEnqueue(`Producto ${parsed.data.name} registrado.`);
  };

  if (!companyId) return <section className="page"><Notice>Seleccione una tienda para registrar operaciones.</Notice></section>;
  const setVariant = (key: string, field: keyof VariantDraft, value: string) => setVariants(variants.map((variant) => variant.key === key ? { ...variant, [field]: value } : variant));

  return <section className="page">
    <div className="page-heading"><span className="eyebrow">REGISTRO SIN CONEXIÓN</span><h1>Clientes y productos</h1><p>Funciona con o sin internet. Lo registrado sin red se marca “pendiente” hasta sincronizar.</p></div>
    <div className="platform-tabs"><button type="button" className="button secondary small" aria-pressed={tab === "customer"} onClick={() => setTab("customer")}>Registrar cliente</button><button type="button" className="button secondary small" aria-pressed={tab === "product"} onClick={() => setTab("product")}>Registrar producto</button></div>
    {message ? <Notice kind="success">{message}</Notice> : null}
    {error ? <Notice kind="error">{error}</Notice> : null}
    {tab === "customer" ? <div className="two-columns">
      <form className="panel" onSubmit={(event) => void submitCustomer(event)}><h2>Nuevo cliente</h2><p className="field-hint">El cliente queda en tu tienda sin acceso. Si luego se registra con el mismo correo, se vincula a esta ficha.</p>
        <div className="form-grid">
          <label>Nombre<input value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} required /></label>
          <label>Apellido<input value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} required /></label>
          <label>Teléfono<input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} inputMode="tel" /></label>
          <label>Documento (CI/NIT)<input value={customer.taxId} onChange={(event) => setCustomer({ ...customer, taxId: event.target.value })} /></label>
          <label className="span-2">Correo (opcional)<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
          <label>Tipo<select value={customer.customerType} onChange={(event) => setCustomer({ ...customer, customerType: event.target.value as "B2C" | "B2B" })}><option value="B2C">Persona</option><option value="B2B">Empresa</option></select></label>
          {customer.customerType === "B2B" ? <label>Razón social<input value={customer.businessName} onChange={(event) => setCustomer({ ...customer, businessName: event.target.value })} /></label> : null}
        </div>
        <button className="button primary">Registrar cliente</button>
      </form>
      <div className="panel"><h2>Clientes de la tienda ({customers.length})</h2><div className="table-wrap"><table className="compact-table"><thead><tr><th>Nombre</th><th>Documento</th><th>Contacto</th><th>Estado</th></tr></thead><tbody>{customers.map((item) => <tr key={item.id}><td>{item.firstName} {item.lastName}</td><td>{item.taxId ?? "—"}</td><td>{item.email ?? item.phone ?? "—"}</td><td>{item.pending ? <span className="status-pill status-pending">Pendiente</span> : item.hasAccess ? "Con acceso" : "Sin acceso"}</td></tr>)}</tbody></table></div></div>
    </div> : <div className="two-columns">
      <form className="panel" onSubmit={(event) => void submitProduct(event)}><h2>Nuevo producto</h2>
        {categories.length === 0 ? <Notice>Sincroniza al menos una vez con conexión para tener categorías y almacenes disponibles sin red.</Notice> : null}
        <label>Nombre<input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} required maxLength={180} /></label>
        <label>Categoría<select value={product.categoryId} onChange={(event) => setProduct({ ...product, categoryId: event.target.value })} required><option value="">Seleccione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Descripción<input value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} /></label>
        <label>Almacén para el stock inicial (opcional)<select value={product.warehouseId} onChange={(event) => setProduct({ ...product, warehouseId: event.target.value })}><option value="">Sin stock inicial</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <h2>Variantes</h2>
        {variants.map((variant) => <div key={variant.key} className="form-grid variant-row">
          <label>Talla<input value={variant.size} onChange={(event) => setVariant(variant.key, "size", event.target.value)} required /></label>
          <label>Color<input value={variant.color} onChange={(event) => setVariant(variant.key, "color", event.target.value)} required /></label>
          <label>SKU<input value={variant.sku} onChange={(event) => setVariant(variant.key, "sku", event.target.value.toUpperCase())} required /></label>
          <label>Precio (BOB)<input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => setVariant(variant.key, "price", event.target.value)} required /></label>
          {product.warehouseId ? <label>Stock inicial<input type="number" min="0" step="1" value={variant.stock} onChange={(event) => setVariant(variant.key, "stock", event.target.value)} /></label> : null}
          {variants.length > 1 ? <button type="button" className="text-button" onClick={() => setVariants(variants.filter((candidate) => candidate.key !== variant.key))}>Quitar</button> : null}
        </div>)}
        <button type="button" className="button secondary small" onClick={() => setVariants([...variants, emptyVariant()])}>Agregar variante</button>
        <label>Imagen (opcional; se sube tras sincronizar)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
        <button className="button primary">Registrar producto</button>
      </form>
      <div className="panel"><h2>Productos ({products.length})</h2><div className="table-wrap"><table className="compact-table"><thead><tr><th>Producto</th><th>Variantes</th><th>Stock</th><th>Estado</th></tr></thead><tbody>{products.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.variants.map((variant) => variant.sku).join(", ")}</td><td>{item.stock.reduce((total, stock) => total + stock.available, 0)}</td><td>{item.pending ? <span className="status-pill status-pending">Pendiente</span> : "Sincronizado"}</td></tr>)}</tbody></table></div></div>
    </div>}
  </section>;
}
