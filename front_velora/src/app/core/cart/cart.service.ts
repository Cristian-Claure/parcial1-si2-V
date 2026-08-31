import { HttpClient } from '@angular/common/http';
import {
  Injectable,
  computed,
  inject,
  signal
} from '@angular/core';
import { Observable, tap } from 'rxjs';

import {
  AddCartItemPayload,
  Cart,
  EMPTY_CART,
  UpdateCartItemPayload
} from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);

  readonly cart = signal<Cart>({
    ...EMPTY_CART,
    items: []
  });

  readonly totalItems = computed(
    () => this.cart().totalItems
  );

  readonly subtotal = computed(
    () => this.cart().subtotal
  );

  load(): Observable<Cart> {
    return this.http.get<Cart>(
      '/api/customer/cart'
    ).pipe(
      tap((cart) => this.cart.set(cart))
    );
  }

  addItem(
    payload: AddCartItemPayload
  ): Observable<Cart> {
    return this.http.post<Cart>(
      '/api/customer/cart/items',
      payload
    ).pipe(
      tap((cart) => this.cart.set(cart))
    );
  }

  updateItem(
    itemId: string,
    payload: UpdateCartItemPayload
  ): Observable<Cart> {
    return this.http.put<Cart>(
      `/api/customer/cart/items/${itemId}`,
      payload
    ).pipe(
      tap((cart) => this.cart.set(cart))
    );
  }

  removeItem(
    itemId: string
  ): Observable<Cart> {
    return this.http.delete<Cart>(
      `/api/customer/cart/items/${itemId}`
    ).pipe(
      tap((cart) => this.cart.set(cart))
    );
  }

  clear(): Observable<void> {
    return this.http.delete<void>(
      '/api/customer/cart'
    ).pipe(
      tap(() => {
        this.cart.set({
          ...EMPTY_CART,
          items: []
        });
      })
    );
  }
}