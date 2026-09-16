import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderResponse, PaymentMethod, PaymentResponse } from "@velora/contracts";
import { paymentMethodLabel, paymentMethodsForOrder } from "./paymentRules";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { offlineCache, type OfflineOrderEntry } from "../../core/offline/offlineDb";
import { syncOfflineOrders } from "../../core/offline/syncOfflineOrders";
import { ConfirmDialog, type ConfirmDialogState } from "../../shared/feedback/ConfirmDialog";
import { EmptyState, Notice } from "../../shared/feedback/Notice";

export function OrdersPage() {
  const user = useAuthStore((state) => state.user)!; const client = useQueryClient(); const [localOrders, setLocalOrders] = useState<OfflineOrderEntry[]>([]); const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const orders = useQuery({ queryKey: ["orders"], queryFn: veloraApi.orders });
  const loadLocal = async () => {
    const entries = await offlineCache.orders(user.id);
    setLocalOrders(entries);
  };
  useEffect(() => {
    let active = true;
    void offlineCache.orders(user.id).then((entries) => {
      if (active) setLocalOrders(entries);
    });
    const handler = () => {
      void offlineCache.orders(user.id).then((entries) => {
        if (active) setLocalOrders(entries);
      });
    };
    window.addEventListener("velora:offline-sync", handler);
    return () => {
      active = false;
      window.removeEventListener("velora:offline-sync", handler);
    };
  }, [user.id]);
  const sync = async () => { const result = await syncOfflineOrders(user.id); await loadLocal(); await client.invalidateQueries({ queryKey: ["orders"] }); setSyncMessage(`Sincronizados: ${result.synced}. Conflictos: ${result.conflicts}.`); };
  const discard = async (id: string) => { await offlineCache.discardOrder(id); await loadLocal(); };
  const retry = async (id: string) => { await offlineCache.retryOrder(id); await loadLocal(); await sync(); };
  const noOrders = !orders.isLoading && (orders.data?.length ?? 0) === 0 && localOrders.length === 0;
  return <section className="page"><div className="page-heading row"><div><span className="eyebrow">MIS PEDIDOS</span><h1>Pedidos y pagos</h1><p>Seguimiento de reservas, pagos y pedidos preparados offline.</p></div><button className="button secondary" disabled={!navigator.onLine || localOrders.length === 0} onClick={() => void sync()}>Sincronizar pendientes</button></div>{syncMessage ? <Notice kind="success">{syncMessage}</Notice> : null}{localOrders.length ? <div className="offline-orders"><h2>Pedidos del dispositivo</h2>{localOrders.map((entry) => <article className="offline-card" key={entry.id}><div><strong>{entry.status === "CONFLICT" ? "Requiere revisión" : "Pendiente de sincronización"}</strong><p>{entry.request.fulfillmentType} · {entry.request.items.reduce((sum, item) => sum + item.quantity, 0)} unidades</p>{entry.errorMessage ? <small className="error-text">{entry.errorMessage}</small> : null}</div><div className="actions">{entry.status === "CONFLICT" ? <button className="button small" onClick={() => void retry(entry.id)}>Reintentar</button> : null}<button className="button small secondary" onClick={() => void discard(entry.id)}>Descartar local</button></div></article>)}</div> : null}{orders.isError ? <Notice kind="error">No fue posible consultar los pedidos del servidor.</Notice> : null}{noOrders ? <EmptyState title="Todavía no hay pedidos">Complete su primera compra desde la bolsa.</EmptyState> : <div className="orders-list">{orders.data?.map((order) => <OrderCard key={order.id} order={order} />)}</div>}</section>;
}

function OrderCard({ order }: { order: OrderResponse }) {
  const client = useQueryClient(); const [method, setMethod] = useState<PaymentMethod>(order.fulfillmentType === "DELIVERY" ? "COD" : "CASH"); const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null); const [message, setMessage] = useState<string | null>(null);
  const payments = useQuery({ queryKey: ["payments", order.id], queryFn: () => veloraApi.paymentsForOrder(order.id) });
  const active = payments.data?.find((payment) => payment.status === "PENDING" || payment.status === "PAID") ?? null;
  const create = useMutation({ mutationFn: async () => {
    if (method === "WEB") { const checkout = await veloraApi.stripeCheckout(order.id); globalThis.location.assign(checkout.checkoutUrl); return null; }
    return veloraApi.createPayment(order.id, { method, notes: `Pago ${method} iniciado desde React Web VÉLORA.` });
  }, onSuccess: async (payment) => { if (payment) setMessage("Pago registrado correctamente."); await client.invalidateQueries({ queryKey: ["payments", order.id] }); } });
  const cancelPayment = useMutation({ mutationFn: (payment: PaymentResponse) => veloraApi.cancelPayment(payment.id, { reason: "Pago cancelado por el cliente desde React Web." }), onSuccess: () => client.invalidateQueries({ queryKey: ["payments", order.id] }) });
  const cancelOrder = useMutation({ mutationFn: () => veloraApi.cancelOrder(order.id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["orders"] }); setMessage("Pedido cancelado; el inventario reservado fue liberado."); } });
  return <article className="order-card"><div className="order-header"><div><span className="status-pill">{order.status}</span><h2>{order.orderNumber}</h2><p>{order.storeName} · {order.fulfillmentType}</p></div><div className="order-amount"><strong>{order.total.toFixed(2)} {order.currency}</strong><small>{new Date(order.createdAt).toLocaleString()}</small></div></div><div className="order-items">{order.items.map((item) => <div key={item.id}><span>{item.productName} · {item.size}/{item.color} × {item.quantity}</span><strong>{item.subtotal.toFixed(2)}</strong></div>)}</div>{message ? <Notice kind="success">{message}</Notice> : null}<div className="payment-area"><h3>Pago</h3>{payments.data?.map((payment) => <div className="payment-row" key={payment.id}><div><strong>{paymentMethodLabel(payment.method)}</strong><span className={`status-pill status-${payment.status.toLowerCase()}`}>{payment.status}</span></div><span>{payment.amount.toFixed(2)} {payment.currency}</span>{payment.status === "PENDING" ? <button className="text-button danger-text" onClick={() => setConfirm({ title: "¿Cancelar este intento de pago?", message: "El pedido continuará reservado y podrá elegir otro método.", confirmLabel: "Cancelar pago", destructive: true, onConfirm: () => cancelPayment.mutateAsync(payment) })}>Cancelar pago</button> : null}</div>)}{order.status === "RESERVED" && !active ? <div className="payment-create"><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{paymentMethodsForOrder(order).map((option) => <option key={option} value={option}>{paymentMethodLabel(option)}</option>)}</select><button className="button primary" disabled={create.isPending} onClick={() => create.mutate()}>{method === "WEB" ? "Ir a Stripe" : "Registrar método"}</button></div> : null}</div>{order.status === "RESERVED" && !active ? <button className="button secondary danger-outline" onClick={() => setConfirm({ title: `¿Cancelar ${order.orderNumber}?`, message: "Las unidades reservadas volverán a estar disponibles.", confirmLabel: "Cancelar pedido", destructive: true, onConfirm: () => cancelOrder.mutateAsync() })}>Cancelar pedido</button> : null}<ConfirmDialog state={confirm} onClose={() => setConfirm(null)} /></article>;
}
