import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';

import {
  Injectable,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';

import {
  firstValueFrom
} from 'rxjs';

import {
  AuthService
} from '../auth/auth.service';

import {
  Order,
  SyncOfflineOrderPayload
} from '../order/order.models';

import {
  CustomerOfflineDisplayItem,
  CustomerOfflineOrderEntry
} from './customer-offline-order.models';

import {
  CUSTOMER_ORDER_STORE,
  openCustomerOfflineDatabase
} from './customer-offline-database';

@Injectable({
  providedIn: 'root'
})
export class CustomerOfflineOrderQueueService {
  private readonly http =
    inject(HttpClient);

  private readonly auth =
    inject(AuthService);

  readonly online =
    signal(
      typeof navigator === 'undefined'
        ? true
        : navigator.onLine
    );

  readonly entries =
    signal<CustomerOfflineOrderEntry[]>([]);

  readonly pendingCount =
    computed(
      () =>
        this.entries().filter(
          (entry) =>
            entry.status === 'PENDING' ||
            entry.status === 'SYNCING'
        ).length
    );

  readonly conflictCount =
    computed(
      () =>
        this.entries().filter(
          (entry) =>
            entry.status === 'CONFLICT'
        ).length
    );

  readonly lastSyncedOrder =
    signal<{
      clientOperationId: string;
      order: Order;
    } | null>(null);

  private syncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'online',
        this.handleOnline
      );

      window.addEventListener(
        'offline',
        this.handleOffline
      );
    }

    effect(
      () => {
        const customerId =
          this.currentCustomerId();

        if (!customerId) {
          this.entries.set([]);
          this.lastSyncedOrder.set(null);
          return;
        }

        void this.recoverPendingOperations(
          customerId
        ).catch(
          () => undefined
        );
      }
    );
  }

  async enqueue(
    payload: SyncOfflineOrderPayload,
    displayItems: CustomerOfflineDisplayItem[]
  ): Promise<CustomerOfflineOrderEntry> {
    const customerId =
      this.requireCustomerId();

    const now =
      new Date().toISOString();

    const entry: CustomerOfflineOrderEntry = {
      customerId,

      clientOperationId:
        payload.clientOperationId,

      payload,

      displayItems,

      status: 'PENDING',

      conflictMessage: null,

      createdAt: now,
      updatedAt: now
    };

    await this.put(entry);
    await this.refresh();

    return entry;
  }

  async refresh(): Promise<void> {
    const customerId =
      this.currentCustomerId();

    if (!customerId) {
      this.entries.set([]);
      return;
    }

    const stored =
      (await this.readAll())
        .filter(
          (entry) =>
            entry.customerId ===
              customerId
        );

    stored.sort(
      (left, right) =>
        right.createdAt.localeCompare(
          left.createdAt
        )
    );

    this.entries.set(stored);
  }

  async syncPending(): Promise<void> {
    const customerId =
      this.currentCustomerId();

    if (
      !customerId ||
      !this.online() ||
      this.syncing
    ) {
      return;
    }

    this.syncing = true;

    try {
      const pending =
        (await this.readAll())
          .filter(
            (entry) =>
              entry.customerId ===
                customerId &&
              entry.status === 'PENDING'
          )
          .sort(
            (left, right) =>
              left.createdAt.localeCompare(
                right.createdAt
              )
          );

      for (const entry of pending) {
        if (
          !this.online() ||
          this.currentCustomerId() !==
            customerId
        ) {
          break;
        }

        const syncingEntry: CustomerOfflineOrderEntry = {
          ...entry,
          status: 'SYNCING',
          conflictMessage: null,
          updatedAt:
            new Date().toISOString()
        };

        await this.put(syncingEntry);
        await this.refresh();

        try {
          const order =
            await firstValueFrom(
              this.http.post<Order>(
                '/api/customer/orders/offline-sync',
                syncingEntry.payload
              )
            );

          await this.remove(
            syncingEntry.clientOperationId
          );

          await this.refresh();

          if (
            this.currentCustomerId() ===
              customerId
          ) {
            this.lastSyncedOrder.set({
              clientOperationId:
                syncingEntry.clientOperationId,

              order
            });
          }
        }
        catch (error: unknown) {
          const httpError =
            error instanceof HttpErrorResponse
              ? error
              : null;

          if (
            httpError?.status === 409
          ) {
            const conflictEntry:
              CustomerOfflineOrderEntry = {
                ...syncingEntry,

                status: 'CONFLICT',

                conflictMessage:
                  this.readError(
                    httpError,
                    'La disponibilidad cambió mientras estuvo sin conexión. Revise los productos antes de volver a intentar.'
                  ),

                updatedAt:
                  new Date().toISOString()
              };

            await this.put(
              conflictEntry
            );

            await this.refresh();

            continue;
          }

          const pendingEntry:
            CustomerOfflineOrderEntry = {
              ...syncingEntry,

              status: 'PENDING',

              conflictMessage: null,

              updatedAt:
                new Date().toISOString()
            };

          await this.put(
            pendingEntry
          );

          await this.refresh();

          if (
            !httpError ||
            httpError.status === 0
          ) {
            this.online.set(false);
            break;
          }

          throw error;
        }
      }
    }
    finally {
      this.syncing = false;
    }
  }

  async removeEntry(
    clientOperationId: string
  ): Promise<void> {
    const customerId =
      this.currentCustomerId();

    if (!customerId) {
      return;
    }

    const entry =
      (await this.readAll())
        .find(
          (candidate) =>
            candidate.clientOperationId ===
              clientOperationId
        );

    if (
      !entry ||
      entry.customerId !==
        customerId
    ) {
      return;
    }

    await this.remove(
      clientOperationId
    );

    await this.refresh();
  }

  async retryConflict(
    clientOperationId: string
  ): Promise<boolean> {
    const customerId =
      this.currentCustomerId();

    if (
      !customerId ||
      !this.online() ||
      this.syncing
    ) {
      return false;
    }

    const entry =
      (await this.readAll())
        .find(
          (candidate) =>
            candidate.customerId ===
              customerId &&
            candidate.clientOperationId ===
              clientOperationId
        );

    if (
      !entry ||
      entry.status !== 'CONFLICT'
    ) {
      return false;
    }

    await this.put({
      ...entry,

      status: 'PENDING',

      conflictMessage: null,

      updatedAt:
        new Date().toISOString()
    });

    await this.refresh();
    await this.syncPending();

    return true;
  }
  private async recoverPendingOperations(
    customerId: string
  ): Promise<void> {
    if (this.syncing) {
      await this.refresh();
      return;
    }

    const stored =
      await this.readAll();

    if (
      this.currentCustomerId() !==
        customerId
    ) {
      return;
    }

    const staleSyncing =
      stored.filter(
        (entry) =>
          entry.customerId ===
            customerId &&
          entry.status === 'SYNCING'
      );

    const recoveredAt =
      new Date().toISOString();

    for (const entry of staleSyncing) {
      if (
        this.currentCustomerId() !==
          customerId
      ) {
        return;
      }

      await this.put({
        ...entry,

        status: 'PENDING',

        conflictMessage: null,

        updatedAt: recoveredAt
      });
    }

    await this.refresh();

    if (
      this.online() &&
      this.currentCustomerId() ===
        customerId
    ) {
      await this.syncPending();
    }
  }
  private currentCustomerId():
    string | null {
    const user =
      this.auth.currentUser();

    return (
      user &&
      user.role === 'CUSTOMER'
    )
      ? user.id
      : null;
  }

  private requireCustomerId():
    string {
    const customerId =
      this.currentCustomerId();

    if (!customerId) {
      throw new Error(
        'No existe una sesión de cliente válida para guardar este pedido.'
      );
    }

    return customerId;
  }
  private readonly handleOnline =
    (): void => {
      this.online.set(true);

      const customerId =
        this.currentCustomerId();

      if (!customerId) {
        this.entries.set([]);
        return;
      }

      void this.recoverPendingOperations(
        customerId
      ).catch(
        () => undefined
      );
    };

  private readonly handleOffline =
    (): void => {
      this.online.set(false);
    };

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const backendMessage =
      error.error?.message;

    return typeof backendMessage === 'string' &&
      backendMessage.trim().length
        ? backendMessage
        : fallback;
  }

  private async readAll():
    Promise<CustomerOfflineOrderEntry[]> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      return await new Promise(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_ORDER_STORE,
              'readonly'
            );

          const store =
            transaction.objectStore(
              CUSTOMER_ORDER_STORE
            );

          const request =
            store.getAll();

          request.onsuccess =
            () => {
              resolve(
                (
                  request.result ??
                  []
                ) as CustomerOfflineOrderEntry[]
              );
            };

          request.onerror =
            () => {
              reject(
                request.error ??
                  new Error(
                    'No fue posible leer los pedidos pendientes.'
                  )
              );
            };
        }
      );
    }
    finally {
      database.close();
    }
  }

  private async put(
    entry: CustomerOfflineOrderEntry
  ): Promise<void> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_ORDER_STORE,
              'readwrite'
            );

          const store =
            transaction.objectStore(
              CUSTOMER_ORDER_STORE
            );

          store.put(entry);

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => {
              reject(
                transaction.error ??
                  new Error(
                    'No fue posible guardar el pedido pendiente.'
                  )
              );
            };

          transaction.onabort =
            () => {
              reject(
                transaction.error ??
                  new Error(
                    'El guardado local del pedido fue cancelado.'
                  )
              );
            };
        }
      );
    }
    finally {
      database.close();
    }
  }

  private async remove(
    clientOperationId: string
  ): Promise<void> {
    const database =
      await openCustomerOfflineDatabase();

    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              CUSTOMER_ORDER_STORE,
              'readwrite'
            );

          const store =
            transaction.objectStore(
              CUSTOMER_ORDER_STORE
            );

          store.delete(
            clientOperationId
          );

          transaction.oncomplete =
            () => resolve();

          transaction.onerror =
            () => {
              reject(
                transaction.error ??
                  new Error(
                    'No fue posible actualizar los pedidos pendientes.'
                  )
              );
            };

          transaction.onabort =
            () => {
              reject(
                transaction.error ??
                  new Error(
                    'La actualización local fue cancelada.'
                  )
              );
            };
        }
      );
    }
    finally {
      database.close();
    }
  }
}
