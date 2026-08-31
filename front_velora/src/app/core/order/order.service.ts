import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import {
  CheckoutWarehouse,
  CreateOrderPayload,
  Order
} from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);

  checkoutWarehouses() {
    return this.http.get<CheckoutWarehouse[]>(
      '/api/customer/checkout/warehouses'
    );
  }

  create(
    payload: CreateOrderPayload
  ) {
    return this.http.post<Order>(
      '/api/customer/orders',
      payload
    );
  }

  list() {
    return this.http.get<Order[]>(
      '/api/customer/orders'
    );
  }

  get(orderId: string) {
    return this.http.get<Order>(
      `/api/customer/orders/${orderId}`
    );
  }

  cancel(orderId: string) {
    return this.http.post<Order>(
      `/api/customer/orders/${orderId}/cancel`,
      {}
    );
  }
}