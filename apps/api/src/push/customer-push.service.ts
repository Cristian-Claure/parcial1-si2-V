import { Injectable } from "@nestjs/common";
import { FirebasePushService, type CustomerPushMessage } from "./firebase-push.service.js";
import { PushRepository, type CustomerOrderPushTarget } from "./push.repository.js";

@Injectable()
export class CustomerPushService {
  constructor(private readonly firebase: FirebasePushService, private readonly repository: PushRepository) {}

  orderConfirmed(userId: string, orderId: string, orderNumber: string): void {
    this.dispatch(userId, { title: "VÉLORA · Pedido recibido", body: `Tu pedido ${orderNumber} fue registrado correctamente.`, type: "ORDER_CONFIRMED", entityId: orderId, route: "/mis-pedidos" });
  }

  orderCancelled(userId: string, orderId: string, orderNumber: string): void {
    this.dispatch(userId, { title: "VÉLORA · Pedido cancelado", body: `Tu pedido ${orderNumber} fue cancelado.`, type: "ORDER_CANCELLED", entityId: orderId, route: "/mis-pedidos" });
  }

  orderFulfilled(orderId: string): void { this.dispatchForOrder(orderId, "ORDER_FULFILLED"); }

  paymentConfirmed(orderId: string): void { this.dispatchForOrder(orderId, "PAYMENT_CONFIRMED"); }
  paymentFailed(orderId: string): void { this.dispatchForOrder(orderId, "PAYMENT_FAILED"); }
  paymentCancelled(orderId: string): void { this.dispatchForOrder(orderId, "PAYMENT_CANCELLED"); }
  paymentRefunded(orderId: string): void { this.dispatchForOrder(orderId, "PAYMENT_REFUNDED"); }

  stripeConfirmed(sessionId: string): void { this.dispatchForStripe(sessionId, "PAYMENT_CONFIRMED"); }
  stripeFailed(sessionId: string): void { this.dispatchForStripe(sessionId, "PAYMENT_FAILED"); }

  private dispatchForOrder(orderId: string, type: string): void {
    queueMicrotask(() => { void this.repository.orderTarget(orderId).then((target) => this.dispatchPaymentTarget(target, type)).catch(() => undefined); });
  }

  private dispatchForStripe(sessionId: string, type: string): void {
    queueMicrotask(() => { void this.repository.stripeTarget(sessionId).then((target) => this.dispatchPaymentTarget(target, type)).catch(() => undefined); });
  }

  private dispatchPaymentTarget(target: CustomerOrderPushTarget | null, type: string): void {
    if (!target) return;
    const content: Record<string, { title: string; body: string }> = {
      PAYMENT_CONFIRMED: { title: "VÉLORA · Pago confirmado", body: `Confirmamos el pago de tu pedido ${target.orderNumber}.` },
      PAYMENT_FAILED: { title: "VÉLORA · Pago no completado", body: `No pudimos confirmar el pago de tu pedido ${target.orderNumber}.` },
      PAYMENT_CANCELLED: { title: "VÉLORA · Pago cancelado", body: `El pago de tu pedido ${target.orderNumber} fue cancelado.` },
      PAYMENT_REFUNDED: { title: "VÉLORA · Reembolso confirmado", body: `El pago de tu pedido ${target.orderNumber} fue reembolsado.` },
      ORDER_FULFILLED: { title: "VÉLORA · Pedido entregado", body: `Tu pedido ${target.orderNumber} fue entregado correctamente.` },
    };
    const selected = content[type];
    if (!selected) return;
    this.dispatch(target.userId, { ...selected, type, entityId: target.orderId, route: "/mis-pedidos" });
  }

  private dispatch(userId: string, message: CustomerPushMessage): void {
    queueMicrotask(() => { void this.firebase.sendToUser(userId, message).catch(() => undefined); });
  }
}
