import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Injectable,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  firstValueFrom
} from 'rxjs';

import {
  PosService
} from '../pos/pos.service';

import {
  OfflinePosSaleEntry,
  QueueOfflinePosSaleInput
} from './pos-offline-queue.models';

@Injectable({
  providedIn: 'root'
})
export class PosOfflineQueueService {
  private readonly pos =
    inject(PosService);

  private readonly databaseName =
    'velora-pos';

  private readonly databaseVersion =
    1;

  private readonly salesStore =
    'pos-sales';

  private dbPromise:
    Promise<IDBDatabase> | null =
      null;

  readonly online =
    signal(
      typeof navigator === 'undefined'
        ? true
        : navigator.onLine
    );

  readonly ready =
    signal(false);

  readonly syncing =
    signal(false);

  readonly entries =
    signal<OfflinePosSaleEntry[]>([]);

  readonly syncVersion =
    signal(0);

  readonly unresolvedCount =
    computed(
      () => this.entries().length
    );

  readonly conflictCount =
    computed(
      () =>
        this.entries().filter(
          (entry) =>
            entry.status ===
              'CONFLICT'
        ).length
    );

  constructor() {
    if (
      typeof window !==
        'undefined'
    ) {
      window.addEventListener(
        'online',
        this.handleOnline
      );

      window.addEventListener(
        'offline',
        this.handleOffline
      );
    }

    void this.initialize();
  }

  pendingForSession(
    cashSessionId: string
  ): number {
    return this.entries().filter(
      (entry) =>
        entry.cashSessionId ===
          cashSessionId
    ).length;
  }

  conflictsForSession(
    cashSessionId: string
  ): number {
    return this.entries().filter(
      (entry) =>
        entry.cashSessionId ===
          cashSessionId &&
        entry.status ===
          'CONFLICT'
    ).length;
  }

  queuedQuantity(
    warehouseId: string,
    variantId: string
  ): number {
    return this.entries()
      .filter(
        (entry) =>
          entry.warehouseId ===
            warehouseId
      )
      .flatMap(
        (entry) =>
          entry.items
      )
      .filter(
        (item) =>
          item.variantId ===
            variantId
      )
      .reduce(
        (total, item) =>
          total + item.quantity,
        0
      );
  }

  async enqueue(
    input: QueueOfflinePosSaleInput
  ): Promise<void> {
    const existing =
      this.entries().find(
        (entry) =>
          entry.clientOperationId ===
            input.payload
              .clientOperationId
      );

    const entry:
      OfflinePosSaleEntry = {
        clientOperationId:
          input.payload
            .clientOperationId,

        pointOfSaleId:
          input.pointOfSaleId,

        warehouseId:
          input.warehouseId,

        cashSessionId:
          input.cashSessionId,

        payload:
          input.payload,

        items:
          input.items,

        total:
          input.total,

        currency:
          input.currency,

        status:
          existing?.status ===
            'CONFLICT'
            ? 'CONFLICT'
            : 'PENDING',

        attempts:
          existing?.attempts ?? 0,

        queuedAt:
          existing?.queuedAt ??
          new Date().toISOString(),

        lastAttemptAt:
          existing
            ?.lastAttemptAt ??
          null,

        lastError:
          existing
            ?.lastError ??
          null
      };

    await this.putEntry(
      entry
    );

    await this.reload();
  }

  async syncPending():
    Promise<void> {
    if (
      !this.ready() ||
      !this.online() ||
      this.syncing()
    ) {
      return;
    }

    this.syncing.set(true);

    try {
      const candidates =
        this.entries().filter(
          (entry) =>
            entry.status ===
              'PENDING'
        );

      for (
        const original
        of candidates
      ) {
        if (!this.online()) {
          break;
        }

        const attempting:
          OfflinePosSaleEntry = {
            ...original,

            status:
              'SYNCING',

            attempts:
              original.attempts + 1,

            lastAttemptAt:
              new Date()
                .toISOString(),

            lastError:
              null
          };

        await this.putEntry(
          attempting
        );

        await this.reload();

        try {
          const openSession =
            await firstValueFrom(
              this.pos.getOpenSession(
                original
                  .pointOfSaleId
              )
            );

          if (
            openSession.id !==
              original
                .cashSessionId
          ) {
            await this.markConflict(
              attempting,
              'La caja asociada a esta venta offline ya no corresponde a la sesión abierta en el servidor.'
            );

            continue;
          }

          await firstValueFrom(
            this.pos.createSale(
              original.payload
            )
          );

          await this.removeEntry(
            original
              .clientOperationId
          );

          this.syncVersion.update(
            (version) =>
              version + 1
          );

          await this.reload();
        }
        catch (error) {
          if (
            this.isNetworkError(
              error
            )
          ) {
            await this.putEntry({
              ...attempting,

              status:
                'PENDING',

              lastError:
                'Sin conexión con el servidor. La venta permanece pendiente de sincronización.'
            });

            await this.reload();

            break;
          }

          if (
            error instanceof
              HttpErrorResponse &&
            (
              error.status ===
                401 ||
              error.status ===
                403
            )
          ) {
            await this.putEntry({
              ...attempting,

              status:
                'PENDING',

              lastError:
                'La sesión de usuario debe volver a autenticarse antes de sincronizar.'
            });

            await this.reload();

            break;
          }

          await this.markConflict(
            attempting,
            this.readError(
              error,
              'La venta requiere revisión manual antes de volver a sincronizar.'
            )
          );
        }
      }
    }
    finally {
      this.syncing.set(false);
    }
  }

  async retryConflictsForSession(
    cashSessionId: string
  ): Promise<void> {
    const conflicts =
      this.entries().filter(
        (entry) =>
          entry.cashSessionId ===
            cashSessionId &&
          entry.status ===
            'CONFLICT'
      );

    for (
      const entry
      of conflicts
    ) {
      await this.putEntry({
        ...entry,

        status:
          'PENDING',

        lastError:
          null
      });
    }

    await this.reload();

    await this.syncPending();
  }

  async discard(
    clientOperationId: string
  ): Promise<void> {
    await this.removeEntry(
      clientOperationId
    );

    await this.reload();
  }

  private readonly handleOnline =
    (): void => {
      this.online.set(true);

      void this.syncPending();
    };

  private readonly handleOffline =
    (): void => {
      this.online.set(false);
    };

  private async initialize():
    Promise<void> {
    if (
      typeof indexedDB ===
        'undefined'
    ) {
      this.ready.set(true);
      return;
    }

    try {
      const entries =
        await this.readAll();

      /*
       * Si el navegador se cerró
       * durante una sincronización,
       * SYNCING vuelve a PENDING.
       */
      for (
        const entry
        of entries
      ) {
        if (
          entry.status ===
            'SYNCING'
        ) {
          await this.putEntry({
            ...entry,
            status: 'PENDING'
          });
        }
      }

      await this.reload();
    }
    finally {
      this.ready.set(true);
    }

    if (this.online()) {
      void this.syncPending();
    }
  }

  private async markConflict(
    entry: OfflinePosSaleEntry,
    message: string
  ): Promise<void> {
    await this.putEntry({
      ...entry,

      status:
        'CONFLICT',

      lastError:
        message
    });

    await this.reload();
  }

  private async reload():
    Promise<void> {
    const entries =
      await this.readAll();

    this.entries.set(
      entries.sort(
        (a, b) =>
          new Date(a.queuedAt)
            .getTime() -
          new Date(b.queuedAt)
            .getTime()
      )
    );
  }

  private database():
    Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise =
      new Promise(
        (
          resolve,
          reject
        ) => {
          const request =
            indexedDB.open(
              this.databaseName,
              this.databaseVersion
            );

          request.onupgradeneeded =
            () => {
              const db =
                request.result;

              if (
                !db.objectStoreNames
                  .contains(
                    this.salesStore
                  )
              ) {
                const store =
                  db.createObjectStore(
                    this.salesStore,
                    {
                      keyPath:
                        'clientOperationId'
                    }
                  );

                store.createIndex(
                  'cashSessionId',
                  'cashSessionId',
                  {
                    unique: false
                  }
                );

                store.createIndex(
                  'status',
                  'status',
                  {
                    unique: false
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
                  'No fue posible abrir IndexedDB.'
                )
              );
            };
        }
      );

    return this.dbPromise;
  }

  private async readAll():
    Promise<
      OfflinePosSaleEntry[]
    > {
    const db =
      await this.database();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          db.transaction(
            this.salesStore,
            'readonly'
          );

        const request =
          transaction
            .objectStore(
              this.salesStore
            )
            .getAll();

        request.onsuccess =
          () => {
            resolve(
              request.result as
                OfflinePosSaleEntry[]
            );
          };

        request.onerror =
          () => {
            reject(
              request.error ??
              new Error(
                'No fue posible leer la cola offline.'
              )
            );
          };
      }
    );
  }

  private async putEntry(
    entry: OfflinePosSaleEntry
  ): Promise<void> {
    const db =
      await this.database();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          db.transaction(
            this.salesStore,
            'readwrite'
          );

        transaction
          .objectStore(
            this.salesStore
          )
          .put(entry);

        transaction.oncomplete =
          () => resolve();

        transaction.onerror =
          () => {
            reject(
              transaction.error ??
              new Error(
                'No fue posible guardar la venta offline.'
              )
            );
          };

        transaction.onabort =
          () => {
            reject(
              transaction.error ??
              new Error(
                'La escritura IndexedDB fue cancelada.'
              )
            );
          };
      }
    );
  }

  private async removeEntry(
    clientOperationId: string
  ): Promise<void> {
    const db =
      await this.database();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          db.transaction(
            this.salesStore,
            'readwrite'
          );

        transaction
          .objectStore(
            this.salesStore
          )
          .delete(
            clientOperationId
          );

        transaction.oncomplete =
          () => resolve();

        transaction.onerror =
          () => {
            reject(
              transaction.error ??
              new Error(
                'No fue posible eliminar la operación sincronizada.'
              )
            );
          };

        transaction.onabort =
          () => {
            reject(
              transaction.error ??
              new Error(
                'La eliminación IndexedDB fue cancelada.'
              )
            );
          };
      }
    );
  }

  private isNetworkError(
    error: unknown
  ): boolean {
    return (
      error instanceof
        HttpErrorResponse &&
      error.status === 0
    );
  }

  private readError(
    error: unknown,
    fallback: string
  ): string {
    if (
      error instanceof
        HttpErrorResponse
    ) {
      const message =
        error.error?.message;

      if (
        typeof message ===
          'string' &&
        message.trim().length
      ) {
        return message;
      }

      if (
        error.status === 404
      ) {
        return (
          'La caja correspondiente a esta venta ya no está abierta en el servidor.'
        );
      }

      if (
        error.status === 409
      ) {
        return (
          'La venta presenta un conflicto de stock, caja o idempotencia y requiere revisión.'
        );
      }
    }

    if (
      error instanceof Error &&
      error.message.trim().length
    ) {
      return error.message;
    }

    return fallback;
  }
}