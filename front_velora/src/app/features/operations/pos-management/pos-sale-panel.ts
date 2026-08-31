import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';

import {
  forkJoin
} from 'rxjs';

import {
  Product,
  ProductVariant
} from '../../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../../core/catalog/catalog.service';

import {
  InventoryStock
} from '../../../core/inventory/inventory.models';

import {
  InventoryService
} from '../../../core/inventory/inventory.service';

import {
  PosOfflineQueueService
} from '../../../core/offline/pos-offline-queue.service';

import {
  CashSession,
  CreatePosSalePayload,
  PosPaymentMethod,
  PosSale
} from '../../../core/pos/pos.models';

import {
  PosService
} from '../../../core/pos/pos.service';

interface PosCatalogItem {
  productId: string;
  productName: string;
  categoryName: string;
  variant: ProductVariant;
  availableQuantity: number;
}

interface PosCartLine {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
  currency: string;
  quantity: number;
}

@Component({
  selector: 'app-pos-sale-panel',
  standalone: true,
  templateUrl: './pos-sale-panel.html',
  styleUrl: './pos-sale-panel.scss'
})
export class PosSalePanel implements OnChanges {
  @Input({ required: true })
  session!: CashSession;

  @Output()
  readonly cashChanged =
    new EventEmitter<void>();

  private readonly catalog =
    inject(CatalogService);

  private readonly inventory =
    inject(InventoryService);

  private readonly pos =
    inject(PosService);

  readonly offline =
    inject(PosOfflineQueueService);

  readonly products =
    signal<Product[]>([]);

  readonly stock =
    signal<InventoryStock[]>([]);

  readonly productSearch =
    signal('');

  readonly cart =
    signal<PosCartLine[]>([]);

  readonly paymentMethod =
    signal<PosPaymentMethod>('CASH');

  readonly pendingSale =
    signal<PosSale | null>(null);

  readonly loading =
    signal(false);

  readonly busy =
    signal(false);

  readonly successMessage =
    signal<string | null>(null);

  readonly errorMessage =
    signal<string | null>(null);

  /*
   * Si el POST falla por red, conservamos ambos
   * valores para que el reintento tenga exactamente
   * el mismo identificador y la misma fecha cliente.
   */
  readonly saleOperationId =
    signal<string | null>(null);

  readonly saleOperationCreatedAt =
    signal<string | null>(null);

  readonly visibleCatalog =
    computed<PosCatalogItem[]>(() => {
      const query =
        this.productSearch()
          .trim()
          .toLocaleLowerCase('es');

      const stockByVariant =
        new Map(
          this.stock().map(
            (item) => [
              item.variantId,
              Math.max(
                0,
                Number(
                  item.availableQuantity
                ) -
                this.offline.queuedQuantity(
                  this.session.warehouseId,
                  item.variantId
                )
              )
            ]
          )
        );
      const result:
        PosCatalogItem[] = [];

      for (
        const product
        of this.products()
      ) {
        if (
          product.status !== 'ACTIVE'
        ) {
          continue;
        }

        for (
          const variant
          of product.variants
        ) {
          if (!variant.active) {
            continue;
          }

          const candidate =
            [
              product.name,
              product.categoryName,
              variant.sku,
              variant.color,
              variant.size
            ]
              .join(' ')
              .toLocaleLowerCase('es');

          if (
            query &&
            !candidate.includes(query)
          ) {
            continue;
          }

          result.push({
            productId:
              product.id,

            productName:
              product.name,

            categoryName:
              product.categoryName,

            variant,

            availableQuantity:
              stockByVariant.get(
                variant.id
              ) ?? 0
          });
        }
      }

      return result.sort(
        (a, b) => {
          const byProduct =
            a.productName.localeCompare(
              b.productName,
              'es'
            );

          if (byProduct !== 0) {
            return byProduct;
          }

          const byColor =
            a.variant.color.localeCompare(
              b.variant.color,
              'es'
            );

          if (byColor !== 0) {
            return byColor;
          }

          return a.variant.size.localeCompare(
            b.variant.size,
            'es'
          );
        }
      );
    });

  readonly totalUnits =
    computed(() =>
      this.cart().reduce(
        (total, line) =>
          total + line.quantity,
        0
      )
    );

  readonly totalAmount =
    computed(() => {
      const total =
        this.cart().reduce(
          (sum, line) =>
            sum +
            (
              Number(line.unitPrice) *
              line.quantity
            ),
          0
        );

      return Number(
        total.toFixed(2)
      );
    });

  constructor() {
    effect(() => {
      const syncVersion =
        this.offline.syncVersion();

      if (
        syncVersion <= 0 ||
        !this.offline.online() ||
        !this.session?.id
      ) {
        return;
      }

      queueMicrotask(() => {
        this.refreshStock();
        this.cashChanged.emit();
      });
    });
  }

  ngOnChanges(
    changes: SimpleChanges
  ): void {
    if (
      changes['session'] &&
      this.session
    ) {
      this.resetForSession();
      this.loadData();
    }
  }

  setSearch(
    value: string
  ): void {
    this.productSearch.set(
      value
    );
  }

  selectPaymentMethod(
    method: PosPaymentMethod
  ): void {
    if (
      this.saleOperationId() ||
      this.pendingSale()
    ) {
      return;
    }

    this.paymentMethod.set(
      method
    );

    this.clearMessages();
  }

  addItem(
    item: PosCatalogItem
  ): void {
    if (
      this.saleOperationId() ||
      this.pendingSale() ||
      this.busy()
    ) {
      return;
    }

    const available =
      Number(
        item.availableQuantity
      );

    if (available <= 0) {
      this.errorMessage.set(
        'La variante seleccionada no tiene stock disponible.'
      );

      return;
    }

    const existing =
      this.cart().find(
        (line) =>
          line.variantId ===
            item.variant.id
      );

    if (existing) {
      const maximum =
        Math.min(
          99,
          available
        );

      if (
        existing.quantity >=
          maximum
      ) {
        this.errorMessage.set(
          'No existe mayor disponibilidad para esta variante.'
        );

        return;
      }

      this.cart.update(
        (current) =>
          current.map(
            (line) =>
              line.variantId ===
                item.variant.id
                ? {
                    ...line,
                    quantity:
                      line.quantity + 1
                  }
                : line
          )
      );
    }
    else {
      this.cart.update(
        (current) => [
          ...current,
          {
            variantId:
              item.variant.id,

            productName:
              item.productName,

            sku:
              item.variant.sku,

            size:
              item.variant.size,

            color:
              item.variant.color,

            unitPrice:
              Number(
                item.variant.price
              ),

            currency:
              item.variant.currency,

            quantity: 1
          }
        ]
      );
    }

    this.clearMessages();
  }

  increase(
    line: PosCartLine
  ): void {
    if (
      this.saleOperationId() ||
      this.pendingSale() ||
      this.busy()
    ) {
      return;
    }

    const available =
      this.availableFor(
        line.variantId
      );

    const maximum =
      Math.min(
        99,
        available
      );

    if (
      line.quantity >= maximum
    ) {
      this.errorMessage.set(
        'La cantidad supera el stock disponible.'
      );

      return;
    }

    this.cart.update(
      (current) =>
        current.map(
          (candidate) =>
            candidate.variantId ===
              line.variantId
              ? {
                  ...candidate,
                  quantity:
                    candidate.quantity + 1
                }
              : candidate
        )
    );
  }

  decrease(
    line: PosCartLine
  ): void {
    if (
      this.saleOperationId() ||
      this.pendingSale() ||
      this.busy()
    ) {
      return;
    }

    if (line.quantity <= 1) {
      this.remove(
        line.variantId
      );

      return;
    }

    this.cart.update(
      (current) =>
        current.map(
          (candidate) =>
            candidate.variantId ===
              line.variantId
              ? {
                  ...candidate,
                  quantity:
                    candidate.quantity - 1
                }
              : candidate
        )
    );
  }

  remove(
    variantId: string
  ): void {
    if (
      this.saleOperationId() ||
      this.pendingSale() ||
      this.busy()
    ) {
      return;
    }

    this.cart.update(
      (current) =>
        current.filter(
          (line) =>
            line.variantId !==
              variantId
        )
    );

    this.clearMessages();
  }

  clearCart(): void {
    if (
      this.saleOperationId() ||
      this.pendingSale() ||
      this.busy()
    ) {
      return;
    }

    this.cart.set([]);
    this.clearMessages();
  }

  availableFor(
    variantId: string
  ): number {
    const serverAvailable =
      Number(
        this.stock().find(
          (item) =>
            item.variantId ===
              variantId
        )?.availableQuantity ?? 0
      );

    const localQuantity =
      this.offline.queuedQuantity(
        this.session.warehouseId,
        variantId
      );

    return Math.max(
      0,
      serverAvailable -
        localQuantity
    );
  }
  createSale(): void {
    if (
      this.busy() ||
      this.pendingSale()
    ) {
      return;
    }

    const lines =
      this.cart();

    if (!lines.length) {
      this.errorMessage.set(
        'Agregue al menos un producto a la venta.'
      );

      return;
    }

    if (
      !this.offline.online() &&
      this.paymentMethod() !==
        'CASH'
    ) {
      this.errorMessage.set(
        'Sin conexión solo se permiten ventas en efectivo. Tarjeta y QR requieren conexión.'
      );

      return;
    }

    for (const line of lines) {
      const available =
        this.availableFor(
          line.variantId
        );

      if (
        line.quantity >
          available
      ) {
        this.errorMessage.set(
          `Stock insuficiente para ${line.productName} · ${line.color} · ${line.size}.`
        );

        return;
      }
    }

    this.clearMessages();
    this.busy.set(true);

    let operationId =
      this.saleOperationId();

    let operationCreatedAt =
      this.saleOperationCreatedAt();

    if (!operationId) {
      operationId =
        crypto.randomUUID();

      operationCreatedAt =
        new Date().toISOString();

      this.saleOperationId.set(
        operationId
      );

      this.saleOperationCreatedAt.set(
        operationCreatedAt
      );
    }

    const payload:
      CreatePosSalePayload = {
        clientOperationId:
          operationId,

        clientCreatedAt:
          operationCreatedAt,

        cashSessionId:
          this.session.id,

        customerId:
          null,

        paymentMethod:
          this.paymentMethod(),

        items:
          lines.map(
            (line) => ({
              variantId:
                line.variantId,

              quantity:
                line.quantity
            })
          ),

        notes:
          'Venta presencial registrada desde el POS web VÉLORA.'
      };

    if (!this.offline.online()) {
      void this.queueCashSale(
        payload,
        lines,
        'Venta en efectivo guardada localmente. Se sincronizará al recuperar la conexión.'
      );

      return;
    }

    this.pos.createSale(
      payload
    ).subscribe({
      next: (sale) => {
        this.busy.set(false);

        this.clearOperation();
        this.cart.set([]);

        if (
          sale.paymentStatus ===
            'PENDING'
        ) {
          this.pendingSale.set(
            sale
          );

          this.successMessage.set(
            `Venta ${sale.orderNumber} reservada. Falta confirmar el pago ${sale.paymentMethod}.`
          );
        }
        else {
          this.pendingSale.set(null);

          this.successMessage.set(
            `Venta ${sale.orderNumber} completada y pagada correctamente.`
          );

          this.cashChanged.emit();
        }

        this.refreshStock();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        /*
         * status 0 significa que no existe
         * respuesta HTTP confiable.
         *
         * Para CASH conservamos el mismo
         * clientOperationId en IndexedDB,
         * porque el servidor pudo haber
         * recibido el POST antes del corte.
         */
        if (
          error.status === 0 &&
          payload.paymentMethod ===
            'CASH'
        ) {
          void this.queueCashSale(
            payload,
            lines,
            'No se recibió respuesta definitiva. La venta quedó protegida localmente para un reintento idempotente.'
          );

          return;
        }

        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible registrar la venta. El identificador se conservará para un reintento seguro.'
          )
        );
      }
    });
  }

  async syncOfflineSales():
    Promise<void> {
    if (!this.offline.online()) {
      this.errorMessage.set(
        'No existe conexión para sincronizar.'
      );

      return;
    }

    this.clearMessages();

    await this.offline.syncPending();

    const unresolved =
      this.offline.pendingForSession(
        this.session.id
      );

    const conflicts =
      this.offline.conflictsForSession(
        this.session.id
      );

    if (unresolved === 0) {
      this.successMessage.set(
        'Todas las ventas locales fueron sincronizadas.'
      );

      return;
    }

    if (conflicts > 0) {
      this.errorMessage.set(
        `${conflicts} venta(s) requieren revisión manual.`
      );

      return;
    }

    this.errorMessage.set(
      'Todavía existen ventas pendientes de sincronización.'
    );
  }

  private async queueCashSale(
    payload: CreatePosSalePayload,
    lines: PosCartLine[],
    message: string
  ): Promise<void> {
    try {
      const total =
        Number(
          lines.reduce(
            (sum, line) =>
              sum +
              (
                Number(
                  line.unitPrice
                ) *
                line.quantity
              ),
            0
          ).toFixed(2)
        );

      await this.offline.enqueue({
        pointOfSaleId:
          this.session.pointOfSaleId,

        warehouseId:
          this.session.warehouseId,

        cashSessionId:
          this.session.id,

        payload,

        items:
          lines.map(
            (line) => ({
              variantId:
                line.variantId,

              productName:
                line.productName,

              sku:
                line.sku,

              size:
                line.size,

              color:
                line.color,

              quantity:
                line.quantity,

              unitPrice:
                line.unitPrice,

              currency:
                line.currency
            })
          ),

        total,

        currency:
          lines[0]?.currency ??
          'BOB'
      });

      this.busy.set(false);

      this.clearOperation();
      this.cart.set([]);

      this.errorMessage.set(null);

      this.successMessage.set(
        message
      );
    }
    catch (error) {
      this.busy.set(false);

      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la venta localmente.'
      );
    }
  }
  discardRetry(): void {
    if (
      this.busy() ||
      !this.saleOperationId()
    ) {
      return;
    }

    if (
      !window.confirm(
        '¿Descartar este intento y permitir modificar la venta?'
      )
    ) {
      return;
    }

    this.clearOperation();

    this.successMessage.set(
      'El identificador de reintento fue descartado. Puede modificar la venta.'
    );

    this.errorMessage.set(null);
  }

  confirmPending(): void {
    const sale =
      this.pendingSale();

    if (
      !sale ||
      sale.paymentStatus !==
        'PENDING' ||
      this.busy()
    ) {
      return;
    }

    if (
      !window.confirm(
        `¿Confirmar el pago ${sale.paymentMethod} de la venta ${sale.orderNumber}?`
      )
    ) {
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    this.pos.confirmSalePayment(
      sale.paymentId,
      'Pago POS confirmado desde la interfaz web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingSale.set(null);

        this.successMessage.set(
          `Pago confirmado. La venta ${sale.orderNumber} quedó completada.`
        );

        this.cashChanged.emit();

        this.refreshStock();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible confirmar el pago POS.'
          )
        );
      }
    });
  }

  failPending(): void {
    const sale =
      this.pendingSale();

    if (
      !sale ||
      sale.paymentStatus !==
        'PENDING' ||
      this.busy()
    ) {
      return;
    }

    if (
      !window.confirm(
        `¿Marcar como fallido el pago de la venta ${sale.orderNumber}? La reserva será liberada.`
      )
    ) {
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    this.pos.failSalePayment(
      sale.paymentId,
      'Pago POS marcado como fallido desde la interfaz web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingSale.set(null);

        this.successMessage.set(
          `Pago fallido registrado. La reserva de ${sale.orderNumber} fue liberada.`
        );

        this.refreshStock();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible marcar el pago como fallido.'
          )
        );
      }
    });
  }

  cancelPending(): void {
    const sale =
      this.pendingSale();

    if (
      !sale ||
      sale.paymentStatus !==
        'PENDING' ||
      this.busy()
    ) {
      return;
    }

    if (
      !window.confirm(
        `¿Cancelar el cobro pendiente de ${sale.orderNumber}?`
      )
    ) {
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    this.pos.cancelSalePayment(
      sale.paymentId,
      'Pago POS cancelado desde la interfaz web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingSale.set(null);

        this.successMessage.set(
          `Cobro cancelado. La reserva de ${sale.orderNumber} fue liberada.`
        );

        this.refreshStock();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cancelar el pago POS.'
          )
        );
      }
    });
  }

  paymentMethodDescription(): string {
    switch (
      this.paymentMethod()
    ) {
      case 'CASH':
        return 'Efectivo: la venta queda pagada y completada inmediatamente.';

      case 'CARD':
        return 'Tarjeta: primero reserva el stock y requiere confirmación del cobro.';

      case 'QR':
        return 'QR: primero reserva el stock y requiere confirmación del cobro.';
    }
  }

  private resetForSession(): void {
    this.products.set([]);
    this.stock.set([]);
    this.productSearch.set('');
    this.cart.set([]);
    this.paymentMethod.set('CASH');
    this.pendingSale.set(null);
    this.clearOperation();
    this.clearMessages();
  }

  private loadData(): void {
    this.loading.set(true);

    forkJoin({
      products:
        this.catalog.publicProducts(),

      stock:
        this.inventory.stock(
          this.session.warehouseId
        )
    }).subscribe({
      next: ({
        products,
        stock
      }) => {
        this.products.set(
          products
        );

        this.stock.set(
          stock
        );

        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar catálogo o inventario para esta caja.'
          )
        );
      }
    });
  }

  private refreshStock(): void {
    this.inventory.stock(
      this.session.warehouseId
    ).subscribe({
      next: (stock) => {
        this.stock.set(stock);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.errorMessage.set(
          this.readError(
            error,
            'La operación terminó, pero no fue posible refrescar el stock.'
          )
        );
      }
    });
  }

  private clearOperation(): void {
    this.saleOperationId.set(null);
    this.saleOperationCreatedAt.set(null);
  }

  private clearMessages(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const message =
      error.error?.message;

    return typeof message ===
      'string' &&
      message.trim().length
      ? message
      : fallback;
  }
}