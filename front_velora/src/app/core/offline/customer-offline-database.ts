export const CUSTOMER_OFFLINE_DATABASE =
  'velora-customer';

export const CUSTOMER_OFFLINE_DATABASE_VERSION =
  2;

export const CUSTOMER_ORDER_STORE =
  'customer-orders';

export const CUSTOMER_CART_STORE =
  'customer-cart';

export const CUSTOMER_CHECKOUT_CONTEXT_STORE =
  'checkout-context';

export function openCustomerOfflineDatabase():
  Promise<IDBDatabase> {
  if (
    typeof indexedDB === 'undefined'
  ) {
    return Promise.reject(
      new Error(
        'El almacenamiento local no está disponible en este dispositivo.'
      )
    );
  }

  return new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          CUSTOMER_OFFLINE_DATABASE,
          CUSTOMER_OFFLINE_DATABASE_VERSION
        );

      request.onupgradeneeded =
        () => {
          const database =
            request.result;

          if (
            !database.objectStoreNames
              .contains(
                CUSTOMER_ORDER_STORE
              )
          ) {
            database.createObjectStore(
              CUSTOMER_ORDER_STORE,
              {
                keyPath:
                  'clientOperationId'
              }
            );
          }

          if (
            !database.objectStoreNames
              .contains(
                CUSTOMER_CART_STORE
              )
          ) {
            database.createObjectStore(
              CUSTOMER_CART_STORE,
              {
                keyPath: 'key'
              }
            );
          }

          if (
            !database.objectStoreNames
              .contains(
                CUSTOMER_CHECKOUT_CONTEXT_STORE
              )
          ) {
            database.createObjectStore(
              CUSTOMER_CHECKOUT_CONTEXT_STORE,
              {
                keyPath: 'key'
              }
            );
          }
        };

      request.onsuccess =
        () => {
          resolve(
            request.result
          );
        };

      request.onerror =
        () => {
          reject(
            request.error ??
              new Error(
                'No fue posible abrir el almacenamiento local de VÉLORA.'
              )
          );
        };

      request.onblocked =
        () => {
          reject(
            new Error(
              'VÉLORA necesita actualizar su almacenamiento local. Cierre otras pestañas de la aplicación e intente nuevamente.'
            )
          );
        };
    }
  );
}
