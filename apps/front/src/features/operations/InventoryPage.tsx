import { formatDateTime, labelFor, MOVEMENT_TYPE_LABELS, stockLevel } from "@velora/contracts";
import { useMemo, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InventoryMovementType } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { useOperationalCompanyId } from "../../core/company/useOperationalCompany";
import { Notice } from "../../shared/feedback/Notice";
import { useUrlState } from "../../shared/hooks/useUrlState";
import { Pagination } from "../../shared/ui/Pagination/Pagination";
import { paginate } from "../../shared/ui/Pagination/paginate";
import { toast } from "../../shared/feedback/toastStore";

const movementTypes: InventoryMovementType[] = ["ENTRY", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RETURN"];
const STOCK_LABELS = { agotado: "Agotado", bajo: "Bajo", normal: "Normal" } as const;
const PAGE_SIZE = 25;

export function InventoryPage() {
  const user = useAuthStore((state) => state.user)!; const companyId = useOperationalCompanyId(); const adminCompanyId = useCompanyStore((state) => state.adminCompanyId); const client = useQueryClient(); const setMessage = (text: string | null) => { if (text) toast(text); }; // P3: aviso breve que se cierra solo
  const { values, set, page, setPage } = useUrlState(["almacen", "q", "nivel"] as const);
  const warehouses = useQuery({ queryKey: ["warehouses", user.role, companyId], queryFn: veloraApi.warehouses, enabled: Boolean(companyId) });
  const stores = useQuery({ queryKey: ["admin-stores", adminCompanyId], queryFn: () => veloraApi.adminStores(adminCompanyId!), enabled: user.role === "ADMIN" && Boolean(adminCompanyId) });
  const products = useQuery({ queryKey: ["managed-products", companyId], queryFn: () => veloraApi.managedProducts(companyId!), enabled: Boolean(companyId) });
  const companyWarehouses = useMemo(() => warehouses.data?.filter((warehouse) => user.role !== "ADMIN" || !adminCompanyId || stores.data?.some((store) => store.id === warehouse.storeId)) ?? [], [warehouses.data, stores.data, user.role, adminCompanyId]);
  const effectiveWarehouse = companyWarehouses.some((warehouse) => warehouse.id === values.almacen) ? values.almacen : companyWarehouses[0]?.id ?? "";
  const stock = useQuery({ queryKey: ["stock", effectiveWarehouse], queryFn: () => veloraApi.stock(effectiveWarehouse), enabled: Boolean(effectiveWarehouse) });
  const history = useQuery({ queryKey: ["inventory-history", effectiveWarehouse], queryFn: () => veloraApi.inventoryHistory(effectiveWarehouse), enabled: Boolean(effectiveWarehouse) });
  const variants = useMemo(() => products.data?.flatMap((product) => product.variants.map((variant) => ({ ...variant, productName: product.name }))) ?? [], [products.data]);
  const filteredStock = useMemo(() => {
    const search = values.q.trim().toLowerCase();
    return (stock.data ?? []).filter((item) => (!values.nivel || stockLevel(item.availableQuantity) === values.nivel) && (!search || `${item.sku} ${item.productName} ${item.size} ${item.color}`.toLowerCase().includes(search)));
  }, [stock.data, values.q, values.nivel]);
  const counts = useMemo(() => ({ agotado: (stock.data ?? []).filter((item) => stockLevel(item.availableQuantity) === "agotado").length, bajo: (stock.data ?? []).filter((item) => stockLevel(item.availableQuantity) === "bajo").length }), [stock.data]);
  const visible = paginate(filteredStock, page, PAGE_SIZE);
  const createWarehouse = useMutation({ mutationFn: veloraApi.createWarehouse, onSuccess: async () => { setMessage("Almacén creado."); await client.invalidateQueries({ queryKey: ["warehouses"] }); } });
  const movement = useMutation({ mutationFn: veloraApi.movement, onSuccess: async () => { setMessage("Movimiento registrado."); await client.invalidateQueries({ queryKey: ["stock"] }); await client.invalidateQueries({ queryKey: ["inventory-history"] }); } });
  if (!companyId) return <section className="page"><Notice>Elige una empresa en el menú para ver su inventario.</Notice></section>;
  const warehouseSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const storeId = user.role === "STORE_MANAGER" ? user.storeId : String(data.get("storeId") ?? ""); if (!storeId) return; await createWarehouse.mutateAsync({ storeId, code: String(data.get("code") ?? ""), name: String(data.get("name") ?? ""), description: String(data.get("description") ?? "") || null, active: true }); form.reset(); };
  const movementSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); await movement.mutateAsync({ warehouseId: effectiveWarehouse, variantId: String(data.get("variantId") ?? ""), movementType: String(data.get("movementType")) as InventoryMovementType, quantity: Number(data.get("quantity") ?? 0), reason: String(data.get("reason") ?? ""), referenceType: null, referenceId: null }); form.reset(); };
  return <section className="page">
    <div className="page-heading"><span className="eyebrow">INVENTARIO</span><h1>Stock por almacén</h1><p>Físico es lo que hay en el almacén; comprometido, lo reservado por pedidos; disponible, lo que se puede vender.</p></div>
    
    {movement.isError ? <Notice kind="error">{movement.error instanceof Error ? movement.error.message : "No se pudo registrar el movimiento."}</Notice> : null}
    <div className="two-columns">
      <div className="panel">
        <h2>Almacén</h2>
        <label>Almacén activo<select value={effectiveWarehouse} onChange={(event) => set({ almacen: event.target.value })}>{companyWarehouses.length === 0 ? <option value="">Sin almacenes</option> : null}{companyWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.storeName} · {warehouse.name}{warehouse.defaultWarehouse ? " · Principal" : ""}</option>)}</select></label>
        <p className="field-hint">El almacén principal de cada sucursal es el que se usa para el retiro en tienda.</p>
        <div className="metric-grid compact"><button type="button" className={values.nivel === "agotado" ? "metric-chip active" : "metric-chip"} onClick={() => set({ nivel: values.nivel === "agotado" ? "" : "agotado" })}><span>Agotadas</span><strong>{counts.agotado}</strong></button><button type="button" className={values.nivel === "bajo" ? "metric-chip active" : "metric-chip"} onClick={() => set({ nivel: values.nivel === "bajo" ? "" : "bajo" })}><span>Stock bajo</span><strong>{counts.bajo}</strong></button></div>
      </div>
      <form className="panel" onSubmit={(event) => void warehouseSubmit(event)}><h2>Nuevo almacén</h2>{user.role === "ADMIN" ? <label>Sucursal<select name="storeId" required><option value="">Elige una sucursal</option>{stores.data?.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label> : <p>Sucursal: <strong>{user.storeName}</strong></p>}<div className="form-grid"><label>Código<input name="code" required maxLength={40} /></label><label>Nombre<input name="name" required maxLength={120} /></label></div><label>Descripción<input name="description" maxLength={240} /></label><button className="button primary" disabled={createWarehouse.isPending}>{createWarehouse.isPending ? "Creando…" : "Crear almacén"}</button></form>
    </div>
    {effectiveWarehouse ? <>
      <form className="panel" onSubmit={(event) => void movementSubmit(event)}><h2>Registrar movimiento</h2><div className="form-grid"><label>Variante<select name="variantId" required><option value="">Elige una variante</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.productName} · {variant.sku} · {variant.size}/{variant.color}</option>)}</select></label><label>Tipo<select name="movementType">{movementTypes.map((type) => <option key={type} value={type}>{labelFor(MOVEMENT_TYPE_LABELS, type)}</option>)}</select></label><label>Cantidad<input name="quantity" type="number" min="1" inputMode="numeric" required /></label><label>Motivo<input name="reason" required maxLength={500} placeholder="Ej.: llegada de proveedor, conteo físico" /></label></div><button className="button primary" disabled={movement.isPending}>{movement.isPending ? "Registrando…" : "Registrar movimiento"}</button><small>Las reservas, liberaciones y ventas las registran los pedidos y la caja automáticamente.</small></form>
      <div className="panel">
        <h2>Stock</h2>
        <div className="toolbar" role="search"><input type="search" aria-label="Buscar en el stock" placeholder="SKU, producto, talla o color…" value={values.q} onChange={(event) => set({ q: event.target.value })} /><select aria-label="Nivel de stock" value={values.nivel} onChange={(event) => set({ nivel: event.target.value })}><option value="">Todos los niveles</option><option value="agotado">Agotado</option><option value="bajo">Bajo</option><option value="normal">Normal</option></select></div>
        {stock.isLoading ? <div className="skeleton-card" aria-busy="true" /> : null}
        {stock.data && filteredStock.length === 0 ? <div className="empty-state"><h3>{stock.data.length ? "Ninguna variante coincide" : "Este almacén aún no tiene stock"}</h3><p>{stock.data.length ? "Cambia el filtro o la búsqueda." : "Registra una entrada con el formulario de arriba."}</p></div> : null}
        {visible.items.length ? <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Producto</th><th>Físico</th><th>Comprometido</th><th>Disponible</th><th>Estado</th></tr></thead><tbody>{visible.items.map((item) => { const level = stockLevel(item.availableQuantity); return <tr key={item.id}><td>{item.sku}</td><td className="truncate">{item.productName} · {item.size}/{item.color}</td><td>{item.physicalQuantity}</td><td>{item.committedQuantity}</td><td>{item.availableQuantity}</td><td><span className={`status-pill status-${level}`}>{STOCK_LABELS[level]}</span></td></tr>; })}</tbody></table></div> : null}
        <Pagination page={visible.page} pageCount={visible.pageCount} total={filteredStock.length} onPage={setPage} label="variantes" />
      </div>
      <div className="panel"><h2>Últimos movimientos</h2>{history.data && history.data.length === 0 ? <p>Sin movimientos todavía.</p> : null}<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>SKU</th><th>Tipo</th><th>Δ físico</th><th>Δ comprometido</th><th>Motivo</th></tr></thead><tbody>{history.data?.slice(0, 50).map((item) => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td>{item.sku}</td><td>{labelFor(MOVEMENT_TYPE_LABELS, item.movementType)}</td><td>{item.physicalDelta}</td><td>{item.committedDelta}</td><td className="truncate">{item.reason ?? "—"}</td></tr>)}</tbody></table></div></div>
    </> : companyWarehouses.length === 0 && warehouses.data ? <div className="empty-state"><h2>Aún no hay almacenes</h2><p>Crea el primer almacén de una sucursal para empezar a registrar stock.</p></div> : null}
  </section>;
}
