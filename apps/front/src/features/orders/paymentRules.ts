import type { OrderResponse, PaymentMethod } from "@velora/contracts";

export function paymentMethodsForOrder(order: Pick<OrderResponse, "fulfillmentType">): PaymentMethod[] {
  return order.fulfillmentType === "DELIVERY" ? ["COD", "WEB", "CARD", "QR"] : ["CASH", "WEB", "CARD", "QR"];
}
export function paymentMethodLabel(method: PaymentMethod): string {
  return ({ COD: "Contra entrega", CASH: "Efectivo en sucursal", CARD: "Tarjeta", WEB: "Stripe Checkout", QR: "QR" } as Record<PaymentMethod, string>)[method];
}
