import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import {
  CreatePaymentPayload,
  Payment,
  PaymentHistory,
  StripeCheckoutSession
} from './payment.models';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);

  create(
    orderId: string,
    payload: CreatePaymentPayload
  ) {
    return this.http.post<Payment>(
      `/api/customer/orders/${orderId}/payments`,
      payload
    );
  }

  createStripeCheckout(
    orderId: string
  ) {
    return this.http.post<StripeCheckoutSession>(
      `/api/customer/orders/${orderId}/payments/stripe-checkout`,
      {}
    );
  }

  listForOrder(orderId: string) {
    return this.http.get<Payment[]>(
      `/api/customer/orders/${orderId}/payments`
    );
  }

  get(paymentId: string) {
    return this.http.get<Payment>(
      `/api/customer/payments/${paymentId}`
    );
  }

  history(paymentId: string) {
    return this.http.get<PaymentHistory[]>(
      `/api/customer/payments/${paymentId}/history`
    );
  }

  cancel(
    paymentId: string,
    reason: string | null
  ) {
    return this.http.post<Payment>(
      `/api/customer/payments/${paymentId}/cancel`,
      { reason }
    );
  }
}