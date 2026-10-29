import { formatDateTime, formatMoney, FULFILLMENT_LABELS, labelFor, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@velora/contracts";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OperationalOrderListItem } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { useOperationalCompanyId } from "../../core/company/useOperationalCompany";
import { ConfirmDialog, type ConfirmDialogState } from "../../shared/feedback/ConfirmDialog";
import { Notice } from "../../shared/feedback/Notice";
import { useUrlState } from "../../shared/hooks/useUrlState";
import { Pagination } from "../../shared/ui/Pagination/Pagination";
import { paginate } from "../../shared/ui/Pagination/paginate";
import { toast } from "../../shared/feedback/toastStore";

const PAGE_SIZE = 20;
const PAYMENT_FILTERS = ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] as const;
const ORDER_FILTERS = ["RESERVED", "FULFILLED", "CANCELLED"] as const;

export function OperationalOrdersPage() {
  const user = useAuthStore((state) => state.user)!; const companyId = useOperationalCompanyId(); const client = useQueryClient(); const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null); const setMessage = (text: string | null) => { if (text) toast(text); }; // P3: aviso breve que se cierra solo
  const { values, set, page, setPage } = useUrlState(["q", "pago", "estado", "sucursal"] as const);
  const role = user.role as "ADMIN" | "STORE_MANAGER";
  const orders = useQuery({ queryKey: ["operational-orders", role, companyId], queryFn: () => veloraApi.operationalOrders(role, companyId ?? undefined), enabled: Boolean(companyId) });
  const stores = useMemo(() => [...new Set((orders.data ?? []).map((order) => order.storeName))].sort(), [orders.data]);
  const filtered = useMemo(() => {
    const search = values.q.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      const latest = order.payments[0];
      return (!values.pago || latest?.status === values.pago) && (!values.estado || order.status === values.estado) && (!values.sucursal || order.storeName === values.sucursal)
        && (!search || `${order.orderNumber} ${order.customerName} ${order.storeName}`.toLowerCase().includes(search));
    });
  }, [orders.data, values.q, values.pago, values.estado, values.sucursal]);
  const visible = paginate(filtered, page, PAGE_SIZE);
  const refresh = async (text: string) => { setMessage(text); await client.invalidateQueries({ queryKey: ["operational-orders"] }); };
  const confirmPayment = useMutation({ mutationFn: (id: string) => veloraApi.confirmPayment(role, id, "Pago confirmado desde el panel web."), onSuccess: () => refresh("Pago confirmado.") });
  const failPayment = useMutation({ mutationFn: (id: string) => veloraApi.failPayment(role, id, "Pago marcado como fallido desde el panel web."), onSuccess: () => refresh("Pago marcado como fallido.") });
  const refundPayment = useMutation({ mutationFn: (id: string) => veloraApi.refundPayment(role, id, "Reembolso procesado desde el panel web."), onSuccess: () => refresh("Pago reembolsado.") });
  const fulfill = useMutation({ mutationFn: (id: string) => veloraApi.fulfillOrder(role, id), onSuccess: () => refresh("Pedido entregado. El stock se descontó.") });
  if (!companyId) return <section className="page"><Notice>Elige una empresa en el menú para ver sus pedidos.</Notice></section>;
  const hasFilters = Boolean(values.q || values.pago || values.estado || values.sucursal);
  return <section className="page">
    <div className="page-heading"><span className="eyebrow">PEDIDOS Y VENTAS</span><h1>Pedidos</h1><p>Confirma pagos, entrega pedidos o reembolsa antes de la entrega. Solo ves los pedidos de tus sucursales.</p></div>
    
    <div className="toolbar" role="search">
      <input type="search" aria-label="Buscar pedidos" placeholder="Pedido, cliente o sucursal…" value={values.q} onChange={(event) => set({ q: event.target.value })} />
      <select aria-label="Estado del pedido" value={values.estado} onChange={(event) => set({ estado: event.target.value })}><option value="">Todos los pedidos</option>{ORDER_FILTERS.map((code) => <option key={code} value={code}>{labelFor(ORDER_STATUS_LABELS, code)}</option>)}</select>
      <select aria-label="Estado del pago" value={values.pago} onChange={(event) => set({ pago: event.target.value })}><option value="">Todos los pagos</option>{PAYMENT_FILTERS.map((code) => <option key={code} value={code}>{labelFor(PAYMENT_STATUS_LABELS, code)}</option>)}</select>
      {stores.length > 1 ? <select aria-label="Sucursal" value={values.sucursal} onChange={(event) => set({ sucursal: event.target.value })}><option value="">Todas las sucursales</option>{stores.map((name) => <option key={name} value={name}>{name}</option>)}</select> : null}
    </div>
    {orders.isLoading ? <div className="orders-list" aria-busy="true">{[0, 1, 2].map((key) => <article key={key} className="order-card skeleton-card" />)}</div> : null}
    {orders.isError ? <Notice kind="error">No se pudieron cargar los pedidos. <button type="button" className="text-link" onClick={() => void orders.refetch()}>Reintentar</button></Notice> : null}
    {orders.data && filtered.length === 0 ? <div className="empty-state"><h2>{hasFilters ? "Ningún pedido coincide con los filtros" : "Todavía no hay pedidos"}</h2><p>{hasFilters ? "Prueba con otro estado o borra la búsqueda." : "Los pedidos de la tienda en línea y de la caja aparecerán aquí."}</p>{hasFilters ? <button type="button" className="button secondary" onClick={() => set({ q: "", pago: "", estado: "", sucursal: "" })}>Quitar filtros</button> : null}</div> : null}
    <div className="orders-list">{visible.items.map((order) => <OperationalCard key={order.id} order={order} onConfirm={(state) => setConfirm(state)} actions={{ confirmPayment: (id) => confirmPayment.mutateAsync(id), failPayment: (id) => failPayment.mutateAsync(id), refundPayment: (id) => refundPayment.mutateAsync(id), fulfill: (id) => fulfill.mutateAsync(id) }} />)}</div>
    <Pagination page={visible.page} pageCount={visible.pageCount} total={filtered.length} onPage={setPage} label="pedidos" />
    <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
  </section>;
}

function OperationalCard({ order, onConfirm, actions }: { order: OperationalOrderListItem; onConfirm: (state: ConfirmDialogState) => void; actions: { confirmPayment: (id: string) => Promise<unknown>; failPayment: (id: string) => Promise<unknown>; refundPayment: (id: string) => Promise<unknown>; fulfill: (id: string) => Promise<unknown>; } }) {
  const latest = order.payments[0] ?? null; const paid = order.payments.find((payment) => payment.status === "PAID") ?? null;
  return <article className="order-card operational">
    <div className="order-header">
      <div><span className={`status-pill status-${order.status.toLowerCase()}`}>{labelFor(ORDER_STATUS_LABELS, order.status)}</span><h2>{order.orderNumber}</h2><p className="truncate">{order.customerName} · {order.customerEmail ?? "sin correo"}</p><small>{order.storeName} · {order.warehouseName} · {labelFor(FULFILLMENT_LABELS, order.fulfillmentType)}</small></div>
      <div className="order-amount"><strong>{formatMoney(order.total, order.currency)}</strong><small>{formatDateTime(order.createdAt)}</small></div>
    </div>
    <div className="payment-area"><h3>Pagos</h3>{order.payments.length ? order.payments.map((payment) => <div className="payment-row" key={payment.id}><span>{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</span><span className={`status-pill status-${payment.status.toLowerCase()}`}>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</span><strong>{formatMoney(payment.amount, payment.currency)}</strong></div>) : <p>Sin pagos registrados.</p>}</div>
    <div className="actions">
      {latest?.status === "PENDING" && latest.provider !== "STRIPE" ? <>
        <button className="button small" onClick={() => onConfirm({ title: "Confirmar pago", message: `Se registrará el pago de ${formatMoney(latest.amount, latest.currency)} (${labelFor(PAYMENT_METHOD_LABELS, latest.method)}) como recibido.`, confirmLabel: "Confirmar pago", onConfirm: () => actions.confirmPayment(latest.id) })}>Confirmar pago</button>
        <button className="button small danger-outline" onClick={() => onConfirm({ title: "Marcar pago fallido", message: "El pedido seguirá reservado y el cliente podrá registrar otro intento de pago.", confirmLabel: "Marcar fallido", destructive: true, onConfirm: () => actions.failPayment(latest.id) })}>Marcar fallido</button>
      </> : null}
      {paid && order.status === "RESERVED" ? <>
        <button className="button small primary" onClick={() => onConfirm({ title: "Entregar pedido", message: "Se descontará el stock reservado, se registrará la venta y el pedido quedará como entregado.", confirmLabel: "Entregar", onConfirm: () => actions.fulfill(order.id) })}>Entregar</button>
        <button className="button small secondary" onClick={() => onConfirm({ title: "Reembolsar pago", message: "Solo es posible antes de la entrega. El pago quedará como reembolsado.", confirmLabel: "Reembolsar", destructive: true, onConfirm: () => actions.refundPayment(paid.id) })}>Reembolsar</button>
      </> : null}
    </div>
  </article>;
}
