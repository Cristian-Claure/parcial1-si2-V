import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CartResponse } from "@velora/contracts";
import { ApiClientError } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { offlineCache } from "../../core/offline/offlineDb";
import { ConfirmDialog, type ConfirmDialogState } from "../../shared/feedback/ConfirmDialog";
import { EmptyState, Notice } from "../../shared/feedback/Notice";

export function CartPage() {
  const user = useAuthStore((state) => state.user)!; const client = useQueryClient(); const [offline, setOffline] = useState(!navigator.onLine); const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null);
  const cart = useQuery({ queryKey: ["cart", user.id], queryFn: async () => {
    try { const current = await veloraApi.cart(); await offlineCache.saveCart(user.id, current); setOffline(false); return current; }
    catch (error) { if (error instanceof ApiClientError && error.status === 0) { const cached = await offlineCache.readCart(user.id); if (cached) { setOffline(true); return cached; } } throw error; }
  }});
  useEffect(() => { const online = () => { setOffline(false); void client.invalidateQueries({ queryKey: ["cart"] }); }; const off = () => setOffline(true); window.addEventListener("online", online); window.addEventListener("offline", off); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", off); }; }, [client]);
  const commit = async (next: CartResponse) => { await offlineCache.saveCart(user.id, next); client.setQueryData(["cart", user.id], next); await client.invalidateQueries({ queryKey: ["cart"] }); };
  const update = useMutation({ mutationFn: ({ id, quantity }: { id: string; quantity: number }) => veloraApi.updateCartItem(id, { quantity }), onSuccess: commit });
  const remove = useMutation({ mutationFn: veloraApi.removeCartItem, onSuccess: commit });
  const clear = useMutation({ mutationFn: veloraApi.clearCart, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["cart"] }); } });
  const value = cart.data;
  if (cart.isLoading) return <section className="page">Cargando su bolsa…</section>;
  if (!value) return <section className="page"><Notice kind="error">No encontramos una bolsa guardada en este dispositivo. Conéctese una vez para preparar su compra.</Notice></section>;
  return <section className="page"><div className="page-heading"><span className="eyebrow">MI BOLSA</span><h1>Su selección</h1><p>{value.totalItems} unidades · {value.subtotal.toFixed(2)} {value.currency}</p></div>{offline ? <Notice>Está viendo la última bolsa guardada. Para modificarla necesita conexión; sí puede preparar un pedido offline desde Checkout.</Notice> : null}{value.items.length === 0 ? <EmptyState title="Su bolsa está vacía">Regrese al catálogo para elegir productos.</EmptyState> : <><div className="cart-list">{value.items.map((item) => <article className="cart-row" key={item.id}><div><h3>{item.productName}</h3><p>{item.size} · {item.color} · {item.sku}</p><strong>{item.unitPrice.toFixed(2)} {item.currency}</strong></div><div className="quantity-control"><button disabled={offline || item.quantity <= 1 || update.isPending} onClick={() => update.mutate({ id: item.id, quantity: item.quantity - 1 })}>−</button><span>{item.quantity}</span><button disabled={offline || item.quantity >= 99 || update.isPending} onClick={() => update.mutate({ id: item.id, quantity: item.quantity + 1 })}>+</button></div><div className="cart-total"><strong>{item.subtotal.toFixed(2)} {item.currency}</strong><button className="text-button danger-text" disabled={offline} onClick={() => remove.mutate(item.id)}>Retirar</button></div></article>)}</div><div className="cart-summary"><div><span>Subtotal</span><strong>{value.subtotal.toFixed(2)} {value.currency}</strong></div><div className="actions"><button className="button secondary" disabled={offline || clear.isPending} onClick={() => setConfirm({ title: "¿Vaciar la bolsa?", message: "Se retirarán todas las piezas. Esta acción no afecta sus favoritos.", confirmLabel: "Vaciar bolsa", destructive: true, onConfirm: () => clear.mutateAsync() })}>Vaciar bolsa</button><Link className="button primary" to="/checkout">Continuar al checkout</Link></div></div></>}<ConfirmDialog state={confirm} onClose={() => setConfirm(null)} /></section>;
}
