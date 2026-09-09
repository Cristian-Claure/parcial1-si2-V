import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { CartResponse, CheckoutWarehouseResponse, CustomerAddressResponse, CustomerFulfillmentType } from "@velora/contracts";
import { ApiClientError } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { offlineCache } from "../../core/offline/offlineDb";
import { Notice } from "../../shared/feedback/Notice";
import { buildOfflineOrder } from "./offlineOrder";

interface CheckoutData { cart: CartResponse; warehouses: CheckoutWarehouseResponse[]; addresses: CustomerAddressResponse[]; offline: boolean; }
export function CheckoutPage() {
  const user = useAuthStore((state) => state.user)!; const navigate = useNavigate(); const client = useQueryClient(); const [fulfillment, setFulfillment] = useState<CustomerFulfillmentType>("PICKUP"); const [warehouseId, setWarehouseId] = useState(""); const [addressId, setAddressId] = useState(""); const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const data = useQuery({ queryKey: ["checkout", user.id], queryFn: async (): Promise<CheckoutData> => {
    try {
      const [cart, warehouses, addresses] = await Promise.all([veloraApi.cart(), veloraApi.checkoutWarehouses(), veloraApi.addresses()]);
      await offlineCache.saveCart(user.id, cart); await offlineCache.saveCheckout(user.id, warehouses, addresses); return { cart, warehouses, addresses, offline: false };
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 0) {
        const [cart, checkout] = await Promise.all([offlineCache.readCart(user.id), offlineCache.readCheckout(user.id)]);
        if (cart && checkout) return { cart, warehouses: checkout.warehouses, addresses: checkout.addresses, offline: true };
      }
      throw reason;
    }
  }});
  const preferredAddress = data.data?.addresses.find((address) => address.defaultAddress) ?? data.data?.addresses[0] ?? null;
  const effectiveWarehouseId = warehouseId || data.data?.warehouses[0]?.warehouseId || "";
  const effectiveAddressId = addressId || preferredAddress?.id || "";
  const selectedWarehouse = useMemo(() => data.data?.warehouses.find((item) => item.warehouseId === effectiveWarehouseId) ?? null, [data.data, effectiveWarehouseId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!data.data || !selectedWarehouse) return; if (data.data.cart.items.length === 0) { setError("Su bolsa está vacía."); return; } if (fulfillment === "DELIVERY" && !effectiveAddressId) { setError("Seleccione una dirección de entrega."); return; }
    setBusy(true); setError(null);
    try {
      if (data.data.offline || !navigator.onLine) {
        const clientOperationId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const request = buildOfflineOrder({ clientOperationId, clientCreatedAt: createdAt, cart: data.data.cart, warehouseId: effectiveWarehouseId, fulfillmentType: fulfillment, addressId: fulfillment === "DELIVERY" ? effectiveAddressId : null, notes: notes.trim() || null });
        await offlineCache.queueOrder({ id: clientOperationId, userId: user.id, status: "PENDING", createdAt, errorMessage: null, request });
      } else {
        await veloraApi.createOrder({ warehouseId: effectiveWarehouseId, fulfillmentType: fulfillment, addressId: fulfillment === "DELIVERY" ? effectiveAddressId : null, notes: notes.trim() || null });
        await client.invalidateQueries({ queryKey: ["cart"] }); await client.invalidateQueries({ queryKey: ["orders"] });
      }
      navigate("/mis-pedidos");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible crear el pedido."); } finally { setBusy(false); }
  };
  if (data.isLoading) return <section className="page">Preparando checkout…</section>;
  if (!data.data) return <section className="page"><Notice kind="error">No hay contexto de checkout disponible. Conéctese una vez para guardar sucursales y direcciones en este dispositivo.</Notice></section>;
  return <section className="page"><div className="page-heading"><span className="eyebrow">CHECKOUT</span><h1>Entrega o retiro</h1><p>El pedido online reserva inventario solamente al llegar correctamente al servidor.</p></div>{data.data.offline ? <Notice>Modo offline: el pedido se guardará localmente sin reservar stock ni crear pagos. Se sincronizará al recuperar conexión.</Notice> : null}{error ? <Notice kind="error">{error}</Notice> : null}<form className="checkout-grid" onSubmit={(event) => void submit(event)}><div className="panel"><h2>1. Modalidad</h2><div className="choice-row"><label className={fulfillment === "PICKUP" ? "choice-card selected" : "choice-card"}><input type="radio" checked={fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} />Retiro en sucursal<small>Solo el almacén principal debe cubrir toda la bolsa.</small></label><label className={fulfillment === "DELIVERY" ? "choice-card selected" : "choice-card"}><input type="radio" checked={fulfillment === "DELIVERY"} onChange={() => setFulfillment("DELIVERY")} />Entrega<small>Usa una dirección guardada.</small></label></div><h2>2. Sucursal / almacén</h2><label>Opción elegible<select value={effectiveWarehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>{data.data.warehouses.map((warehouse) => <option value={warehouse.warehouseId} key={warehouse.warehouseId}>{warehouse.storeName} · {warehouse.warehouseName}</option>)}</select></label>{fulfillment === "DELIVERY" ? <><h2>3. Dirección</h2>{data.data.addresses.length ? <label>Dirección<select value={effectiveAddressId} onChange={(event) => setAddressId(event.target.value)} required>{data.data.addresses.map((address) => <option value={address.id} key={address.id}>{address.label} · {address.addressLine}</option>)}</select></label> : <Notice kind="error">No tiene direcciones guardadas. <Link to="/mi-cuenta">Registre una dirección</Link>.</Notice>}</> : null}<label>Observaciones<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label></div><aside className="panel order-preview"><h2>Resumen</h2>{data.data.cart.items.map((item) => <div className="preview-line" key={item.id}><span>{item.productName} × {item.quantity}</span><strong>{item.subtotal.toFixed(2)}</strong></div>)}<div className="preview-total"><span>Total</span><strong>{data.data.cart.subtotal.toFixed(2)} {data.data.cart.currency}</strong></div><button className="button primary full" disabled={busy || !selectedWarehouse}>{busy ? "Procesando…" : data.data.offline ? "Guardar pedido offline" : "Confirmar pedido"}</button></aside></form></section>;
}
