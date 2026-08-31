import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import {
  CreateOnlinePaymentIntentPayload,
  CreatePaymentPayload,
  OnlinePaymentIntent,
  Payment,
  PaymentHistory
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

  createOnlineIntent(
    orderId: string,
    payload:
      CreateOnlinePaymentIntentPayload
  ) {
    return this.http.post<
      OnlinePaymentIntent
    >(
      `/api/customer/orders/${orderId}/payments/online-intent`,
      payload
    );
  }

  getOnlineIntent(
    paymentId: string
  ) {
    return this.http.get<
      OnlinePaymentIntent
    >(
      `/api/customer/payments/${paymentId}/online-intent`
    );
  }

  confirmOnlineSandbox(
    paymentId: string
  ) {
    return this.http.post<Payment>(
      `/api/customer/payments/${paymentId}/sandbox-confirm`,
      {}
    );
  }

  listForOrder(
    orderId: string
  ) {
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