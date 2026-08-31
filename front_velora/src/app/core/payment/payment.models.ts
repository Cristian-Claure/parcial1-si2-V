export type PaymentMethod =
  | 'COD'
  | 'CASH'
  | 'CARD'
  | 'WEB'
  | 'QR';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface CreatePaymentPayload {
  method: PaymentMethod;
  notes: string | null;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  storeId: string;
  storeName: string;

  method: PaymentMethod;
  status: PaymentStatus;

  amount: number;
  currency: string;

  provider: string | null;
  externalReference: string | null;
  notes: string | null;

  processedById: string | null;
  processedByName: string | null;

  createdAt: string;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
}

export interface CreateOnlinePaymentIntentPayload {
  method:
    | 'CARD'
    | 'QR';

  /*
   * Para CARD enviamos solamente un
   * token temporal sandbox.
   *
   * Nunca se envían al backend el número
   * completo ni el CVV.
   */
  cardToken: string | null;
  cardBrand: string | null;
  cardLast4: string | null;

  notes: string | null;
}

export interface OnlinePaymentIntent {
  payment: Payment;

  /*
   * Solo existe para pagos QR.
   */
  qrPayload: string | null;

  /*
   * ISO-8601. Solo aplica al QR.
   */
  expiresAt: string | null;
}

export interface PaymentHistory {
  id: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  changedById: string;
  changedByName: string;
  reason: string | null;
  createdAt: string;
}