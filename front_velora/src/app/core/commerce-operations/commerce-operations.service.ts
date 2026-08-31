import {
  HttpClient
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

import {
  AuthService
} from '../auth/auth.service';

import {
  Order
} from '../order/order.models';

import {
  Payment
} from '../payment/payment.models';

import {
  OperationalOrder
} from './commerce-operations.models';

@Injectable({ providedIn: 'root' })
export class CommerceOperationsService {
  private readonly http =
    inject(HttpClient);

  private readonly auth =
    inject(AuthService);

  listOrders() {
    return this.http.get<
      OperationalOrder[]
    >(
      `${this.baseUrl()}/orders`
    );
  }

  confirmPayment(
    paymentId: string,
    reason: string | null
  ) {
    return this.http.post<Payment>(
      `${this.baseUrl()}/payments/${paymentId}/confirm`,
      { reason }
    );
  }

  failPayment(
    paymentId: string,
    reason: string | null
  ) {
    return this.http.post<Payment>(
      `${this.baseUrl()}/payments/${paymentId}/fail`,
      { reason }
    );
  }

  refundPayment(
    paymentId: string,
    reason: string | null
  ) {
    return this.http.post<Payment>(
      `${this.baseUrl()}/payments/${paymentId}/refund`,
      { reason }
    );
  }

  fulfillOrder(
    orderId: string
  ) {
    return this.http.post<Order>(
      `${this.baseUrl()}/orders/${orderId}/fulfill`,
      {}
    );
  }

  private baseUrl(): string {
    const role =
      this.auth.currentUser()?.role;

    if (role === 'ADMIN') {
      return '/api/admin';
    }

    if (role === 'STORE_MANAGER') {
      return '/api/manager';
    }

    throw new Error(
      'Rol no autorizado para operaciones comerciales.'
    );
  }
}