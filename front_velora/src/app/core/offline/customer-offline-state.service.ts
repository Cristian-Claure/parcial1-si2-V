import {
  Injectable,
  inject
} from '@angular/core';

import {
  AuthService
} from '../auth/auth.service';

import type {
  Cart
} from '../cart/cart.models';

import type {
  CustomerAddress
} from '../customer/customer.models';

import type {
  CheckoutWarehouse
} from '../order/order.models';

import {
  CUSTOMER_CART_STORE,
  CUSTOMER_CHECKOUT_CONTEXT_STORE,
  openCustomerOfflineDatabase
} from './customer-offline-database';

interface StoredCart {
  key: string;
  value: Cart;
  savedAt: string;
}

export interface CustomerOfflineCheckoutContext {
  addresses: CustomerAddress[];
  warehouses: CheckoutWarehouse[];
  savedAt: string;
}

interface StoredCheckoutContext {
  key: string;
  value: CustomerOfflineCheckoutContext;
  savedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerOfflineStateService {
  private readonly auth =
    inject(AuthService);

  async saveCart(
    cart: Cart
  ): Promise<void> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_CART_STORE,
              'readwrite'
            );

          const record: StoredCart = {
            key: this.storageKey('cart'),
            value: cart,
            savedAt:
              new Date().toISOString()
          };

          transaction
            .objectStore(
              CUSTOMER_CART_STORE
            )
            .put(record);

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => reject(
              transaction.error ??
                new Error(
                  'No fue posible guardar su bolsa en este dispositivo.'
                )
            );

          transaction.onabort =
            () => reject(
              transaction.error ??
                new Error(
                  'El guardado local de la bolsa fue cancelado.'
                )
            );
        }
      );
    }
    finally {
      database.close();
    }
  }

  async loadCart():
    Promise<Cart | null> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      return await new Promise(
        (resolve, reject) => {
          const request =
            database
              .transaction(
                CUSTOMER_CART_STORE,
                'readonly'
              )
              .objectStore(
                CUSTOMER_CART_STORE
              )
              .get(
                this.storageKey('cart')
              );

          request.onsuccess =
            () => {
              const record =
                (
                  request.result ??
                  null
                ) as StoredCart | null;

              resolve(
                record?.value ?? null
              );
            };

          request.onerror =
            () => reject(
              request.error ??
                new Error(
                  'No fue posible recuperar su bolsa guardada.'
                )
            );
        }
      );
    }
    finally {
      database.close();
    }
  }

  async clearCart():
    Promise<void> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_CART_STORE,
              'readwrite'
            );

          transaction
            .objectStore(
              CUSTOMER_CART_STORE
            )
            .delete(
              this.storageKey('cart')
            );

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => reject(
              transaction.error ??
                new Error(
                  'No fue posible limpiar la bolsa guardada.'
                )
            );

          transaction.onabort =
            () => reject(
              transaction.error ??
                new Error(
                  'La actualización local de la bolsa fue cancelada.'
                )
            );
        }
      );
    }
    finally {
      database.close();
    }
  }

  async saveCheckoutContext(
    addresses: CustomerAddress[],
    warehouses: CheckoutWarehouse[]
  ): Promise<void> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_CHECKOUT_CONTEXT_STORE,
              'readwrite'
            );

          const now =
            new Date().toISOString();

          const value:
            CustomerOfflineCheckoutContext = {
              addresses,
              warehouses,
              savedAt: now
            };

          const record:
            StoredCheckoutContext = {
              key: this.storageKey('checkout'),
              value,
              savedAt: now
            };

          transaction
            .objectStore(
              CUSTOMER_CHECKOUT_CONTEXT_STORE
            )
            .put(record);

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => reject(
              transaction.error ??
                new Error(
                  'No fue posible guardar la información de entrega en este dispositivo.'
                )
            );

          transaction.onabort =
            () => reject(
              transaction.error ??
                new Error(
                  'El guardado local del checkout fue cancelado.'
                )
            );
        }
      );
    }
    finally {
      database.close();
    }
  }

  async loadCheckoutContext():
    Promise<CustomerOfflineCheckoutContext | null> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      return await new Promise(
        (resolve, reject) => {
          const request =
            database
              .transaction(
                CUSTOMER_CHECKOUT_CONTEXT_STORE,
                'readonly'
              )
              .objectStore(
                CUSTOMER_CHECKOUT_CONTEXT_STORE
              )
              .get(
                this.storageKey('checkout')
              );

          request.onsuccess =
            () => {
              const record =
                (
                  request.result ??
                  null
                ) as
                  StoredCheckoutContext |
                  null;

              resolve(
                record?.value ?? null
              );
            };

          request.onerror =
            () => reject(
              request.error ??
                new Error(
                  'No fue posible recuperar la información de entrega guardada.'
                )
            );
        }
      );
    }
    finally {
      database.close();
    }
  }
  private storageKey(
    scope: 'cart' | 'checkout'
  ): string {
    const user =
      this.auth.currentUser();

    if (
      !user ||
      user.role !== 'CUSTOMER'
    ) {
      throw new Error(
        'No existe una sesión de cliente válida para acceder al almacenamiento local.'
      );
    }

    return `${user.id}:${scope}`;
  }
}
