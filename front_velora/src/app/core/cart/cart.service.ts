import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';

import {
  Injectable,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  Observable,
  catchError,
  from,
  map,
  tap,
  throwError
} from 'rxjs';

import {
  CustomerOfflineStateService
} from '../offline/customer-offline-state.service';

import {
  AddCartItemPayload,
  Cart,
  EMPTY_CART,
  UpdateCartItemPayload
} from './cart.models';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly http =
    inject(HttpClient);

  private readonly offlineState =
    inject(CustomerOfflineStateService);

  readonly cart = signal<Cart>({
    ...EMPTY_CART,
    items: []
  });

  readonly totalItems =
    computed(
      () =>
        this.cart().totalItems
    );

  readonly subtotal =
    computed(
      () =>
        this.cart().subtotal
    );

  load(): Observable<Cart> {
    return this.http
      .get<Cart>(
        '/api/customer/cart'
      )
      .pipe(
        tap(
          (cart) =>
            this.storeCart(cart)
        ),

        catchError(
          (error: unknown) => {
            if (
              !this.isConnectivityError(
                error
              )
            ) {
              return throwError(
                () => error
              );
            }

            return from(
              this.offlineState
                .loadCart()
            ).pipe(
              map(
                (cachedCart) => {
                  if (!cachedCart) {
                    throw new Error(
                      'No encontramos una bolsa guardada en este dispositivo. Conéctese una vez para preparar su compra.'
                    );
                  }

                  this.cart.set(
                    cachedCart
                  );

                  return cachedCart;
                }
              )
            );
          }
        )
      );
  }

  addItem(
    payload: AddCartItemPayload
  ): Observable<Cart> {
    return this.http
      .post<Cart>(
        '/api/customer/cart/items',
        payload
      )
      .pipe(
        tap(
          (cart) =>
            this.storeCart(cart)
        )
      );
  }

  updateItem(
    itemId: string,
    payload: UpdateCartItemPayload
  ): Observable<Cart> {
    return this.http
      .put<Cart>(
        `/api/customer/cart/items/${itemId}`,
        payload
      )
      .pipe(
        tap(
          (cart) =>
            this.storeCart(cart)
        )
      );
  }

  removeItem(
    itemId: string
  ): Observable<Cart> {
    return this.http
      .delete<Cart>(
        `/api/customer/cart/items/${itemId}`
      )
      .pipe(
        tap(
          (cart) =>
            this.storeCart(cart)
        )
      );
  }

  clear(): Observable<void> {
    return this.http
      .delete<void>(
        '/api/customer/cart'
      )
      .pipe(
        tap(
          () => {
            this.cart.set({
              ...EMPTY_CART,
              items: []
            });

            void this.offlineState
              .clearCart()
              .catch(
                () => undefined
              );
          }
        )
      );
  }

  private storeCart(
    cart: Cart
  ): void {
    this.cart.set(cart);

    void this.offlineState
      .saveCart(cart)
      .catch(
        () => undefined
      );
  }

  private isConnectivityError(
    error: unknown
  ): boolean {
    if (
      error instanceof
        HttpErrorResponse &&
      error.status === 0
    ) {
      return true;
    }

    return (
      typeof navigator !==
        'undefined' &&
      !navigator.onLine
    );
  }
}
