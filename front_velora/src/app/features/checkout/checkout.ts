import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  Router
} from '@angular/router';

import {
  forkJoin
} from 'rxjs';

import {
  AuthService
} from '../../core/auth/auth.service';

import {
  CartService
} from '../../core/cart/cart.service';

import {
  CustomerAddress
} from '../../core/customer/customer.models';

import {
  CustomerService
} from '../../core/customer/customer.service';

import {
  CustomerOfflineOrderQueueService
} from '../../core/offline/customer-offline-order-queue.service';

import {
  CustomerOfflineStateService
} from '../../core/offline/customer-offline-state.service';

import {
  CheckoutWarehouse,
  Order
} from '../../core/order/order.models';

import {
  OrderService
} from '../../core/order/order.service';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

import {
  CUSTOMER_NAV_ITEMS
} from '../../shared/customer-navigation';

import {
  OnlinePaymentPanel
} from './online-payment-panel';

type EcommerceFulfillment =
  | 'DELIVERY'
  | 'PICKUP';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    AuthenticatedShell,
    ReactiveFormsModule,
    OnlinePaymentPanel
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss'
})
export class Checkout {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  readonly offline =
    inject(CustomerOfflineOrderQueueService);

  private readonly offlineState =
    inject(CustomerOfflineStateService);

  private readonly customer =
    inject(CustomerService);

  private readonly orders =
    inject(OrderService);

  readonly router =
    inject(Router);

  private readonly fb =
    inject(FormBuilder);

  readonly addresses =
    signal<CustomerAddress[]>([]);

  readonly warehouses =
    signal<CheckoutWarehouse[]>([]);

  readonly loading =
    signal(true);

  readonly placingOrder =
    signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly createdOrder =
    signal<Order | null>(null);

  readonly offlineQueuedOperationId =
    signal<string | null>(null);

  readonly resolvingOfflineConflict =
    signal(false);

  readonly offlineConflict =
    computed(
      () =>
        this.offline.entries().find(
          (entry) =>
            entry.status === 'CONFLICT'
        ) ?? null
    );

  readonly navItems: ShellNavItem[] =
    CUSTOMER_NAV_ITEMS;

  readonly form =
    this.fb.nonNullable.group({
      fulfillmentType:
        this.fb.nonNullable.control<
          EcommerceFulfillment
        >(
          'DELIVERY',
          Validators.required
        ),

      warehouseId: [
        '',
        Validators.required
      ],

      addressId: [''],

      notes: [
        '',
        Validators.maxLength(500)
      ]
    });

  constructor() {
    effect(
      () => {
        const synced =
          this.offline.lastSyncedOrder();

        const operationId =
          this.offlineQueuedOperationId();

        if (
          !synced ||
          !operationId ||
          synced.clientOperationId !==
            operationId
        ) {
          return;
        }

        this.handleSyncedOfflineOrder(
          synced.order
        );
      }
    );

    this.loadCheckout();
  }

  userLabel(): string {
    const user =
      this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Cliente';
  }

  fulfillmentType():
    EcommerceFulfillment {
    return this.form.controls
      .fulfillmentType.value;
  }

  selectFulfillment(
    type: EcommerceFulfillment
  ): void {
    this.errorMessage.set(null);

    this.form.controls
      .fulfillmentType
      .setValue(type);

    if (type === 'PICKUP') {
      this.form.controls
        .addressId
        .setValue('');
    }
    else {
      const defaultAddress =
        this.addresses().find(
          (address) =>
            address.defaultAddress
        );

      if (defaultAddress) {
        this.form.controls
          .addressId
          .setValue(
            defaultAddress.id
          );
      }
    }
  }

  selectedWarehouse():
    CheckoutWarehouse | null {
    const warehouseId =
      this.form.controls
        .warehouseId.value;

    return this.warehouses().find(
      (warehouse) =>
        warehouse.warehouseId ===
          warehouseId
    ) ?? null;
  }

  selectedAddress():
    CustomerAddress | null {
    const addressId =
      this.form.controls
        .addressId.value;

    return this.addresses().find(
      (address) =>
        address.id === addressId
    ) ?? null;
  }

  placeOrder(): void {
    this.errorMessage.set(null);

    if (
      this.cart.cart().items.length === 0
    ) {
      this.errorMessage.set(
        'La bolsa está vacía.'
      );

      return;
    }

    if (
      this.warehouses().length === 0
    ) {
      this.errorMessage.set(
        'Ninguna sucursal puede abastecer actualmente todos los productos de la bolsa.'
      );

      return;
    }

    if (
      !this.form.controls
        .warehouseId.value
    ) {
      this.errorMessage.set(
        'Seleccione una sucursal de abastecimiento.'
      );

      return;
    }

    if (
      this.fulfillmentType() ===
        'DELIVERY' &&
      !this.form.controls
        .addressId.value
    ) {
      this.errorMessage.set(
        'Seleccione una dirección de entrega.'
      );

      return;
    }

    if (
      this.form.invalid ||
      this.placingOrder()
    ) {
      this.form.markAllAsTouched();
      return;
    }

    const value =
      this.form.getRawValue();

    if (!this.offline.online()) {
      void this.queueOfflineOrder();
      return;
    }

    this.placingOrder.set(true);

    this.orders.create({
      warehouseId:
        value.warehouseId,

      fulfillmentType:
        value.fulfillmentType,

      addressId:
        value.fulfillmentType ===
          'DELIVERY'
          ? value.addressId
          : null,

      notes:
        this.optional(
          value.notes
        )
    }).subscribe({
      next: (order) => {
        this.placingOrder.set(false);
        this.createdOrder.set(order);

        /*
         * El backend convierte el carrito original
         * a CONVERTED. Volvemos a consultar para
         * sincronizar la bolsa local con el servidor.
         */
        this.cart.load().subscribe({
          error: () => undefined
        });
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.placingOrder.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible generar el pedido.'
          )
        );
      }
    });
  }

  async retryOfflineConflict():
    Promise<void> {
    const conflict =
      this.offlineConflict();

    if (
      !conflict ||
      this.resolvingOfflineConflict()
    ) {
      return;
    }

    if (!this.offline.online()) {
      this.errorMessage.set(
        'Necesita conexión para volver a validar esta selección.'
      );

      return;
    }

    this.resolvingOfflineConflict.set(
      true
    );

    this.errorMessage.set(null);

    this.offlineQueuedOperationId.set(
      conflict.clientOperationId
    );

    try {
      const started =
        await this.offline.retryConflict(
          conflict.clientOperationId
        );

      if (!started) {
        if (
          this.offlineQueuedOperationId() ===
            conflict.clientOperationId
        ) {
          this.offlineQueuedOperationId.set(
            null
          );
        }

        this.errorMessage.set(
          'La sincronización ya está en proceso o el conflicto dejó de estar disponible. Espere un momento y vuelva a intentarlo.'
        );
      }
    }
    catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error &&
        error.message.trim().length
          ? error.message
          : 'No fue posible volver a validar este pedido.'
      );
    }
    finally {
      this.resolvingOfflineConflict.set(
        false
      );
    }
  }

  async discardOfflineConflict():
    Promise<void> {
    const conflict =
      this.offlineConflict();

    if (
      !conflict ||
      this.resolvingOfflineConflict()
    ) {
      return;
    }

    this.resolvingOfflineConflict.set(
      true
    );

    this.errorMessage.set(null);

    try {
      await this.offline.removeEntry(
        conflict.clientOperationId
      );

      if (
        this.offlineQueuedOperationId() ===
          conflict.clientOperationId
      ) {
        this.offlineQueuedOperationId.set(
          null
        );
      }
    }
    catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error &&
        error.message.trim().length
          ? error.message
          : 'No fue posible descartar este intento de pedido.'
      );
    }
    finally {
      this.resolvingOfflineConflict.set(
        false
      );
    }
  }
  private async queueOfflineOrder():
    Promise<void> {
    const currentCart =
      this.cart.cart();

    const value =
      this.form.getRawValue();

    this.placingOrder.set(true);
    this.errorMessage.set(null);

    try {
      const clientOperationId =
        globalThis.crypto.randomUUID();

      const clientCreatedAt =
        new Date().toISOString();

      await this.offline.enqueue(
        {
          clientOperationId,
          clientCreatedAt,

          sourceCartId:
            currentCart.id,

          warehouseId:
            value.warehouseId,

          fulfillmentType:
            value.fulfillmentType,

          addressId:
            value.fulfillmentType ===
              'DELIVERY'
              ? value.addressId
              : null,

          notes:
            this.optional(
              value.notes
            ),

          items:
            currentCart.items.map(
              (item) => ({
                variantId:
                  item.variantId,

                quantity:
                  item.quantity
              })
            )
        },

        currentCart.items.map(
          (item) => ({
            variantId:
              item.variantId,

            productName:
              item.productName,

            sku:
              item.sku,

            size:
              item.size,

            color:
              item.color,

            quantity:
              item.quantity,

            unitPrice:
              item.unitPrice,

            currency:
              item.currency
          })
        )
      );

      this.offlineQueuedOperationId.set(
        clientOperationId
      );
    }
    catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error &&
        error.message.trim().length
          ? error.message
          : 'No fue posible guardar su pedido en este dispositivo.'
      );
    }
    finally {
      this.placingOrder.set(false);
    }
  }
  private handleSyncedOfflineOrder(
    order: Order
  ): void {
    this.errorMessage.set(null);
    this.placingOrder.set(false);

    this.offlineQueuedOperationId.set(
      null
    );

    this.createdOrder.set(
      order
    );

    this.cart.load().subscribe({
      error: () => undefined
    });
  }
  goToCatalog(): void {
    void this.router.navigate(
      ['/catalogo']
    );
  }

  goToAccount(): void {
    void this.router.navigate(
      ['/mi-cuenta']
    );
  }

  goToOrders(): void {
    void this.router.navigate(
      ['/mis-pedidos']
    );
  }

  logout(): void {
    this.auth.logout();

    void this.router.navigate(
      ['/']
    );
  }

  private loadCheckout(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    if (!this.offline.online()) {
      void this.restoreOfflineCheckout();
      return;
    }

    forkJoin({
      cart:
        this.cart.load(),

      addresses:
        this.customer.addresses(),

      warehouses:
        this.orders
          .checkoutWarehouses()
    }).subscribe({
      next: ({
        cart,
        addresses,
        warehouses
      }) => {
        this.applyCheckoutContext(
          addresses,
          warehouses
        );

        void this.offlineState
          .saveCheckoutContext(
            addresses,
            warehouses
          )
          .catch(
            () => undefined
          );

        if (
          cart.items.length === 0
        ) {
          this.errorMessage.set(
            'Su bolsa está vacía. Agregue una prenda antes de continuar con la compra.'
          );
        }

        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        if (
          error.status === 0 ||
          !this.offline.online()
        ) {
          this.offline.online.set(false);

          void this.restoreOfflineCheckout();

          return;
        }

        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No pudimos preparar su compra en este momento. Intente nuevamente.'
          )
        );
      }
    });
  }

  private async restoreOfflineCheckout():
    Promise<void> {
    try {
      const [
        cachedCart,
        context
      ] = await Promise.all([
        this.offlineState.loadCart(),
        this.offlineState.loadCheckoutContext()
      ]);

      if (!cachedCart) {
        this.loading.set(false);

        this.errorMessage.set(
          'No encontramos una bolsa guardada en este dispositivo. Conéctese una vez para preparar una compra que pueda continuar sin conexión.'
        );

        return;
      }

      if (!context) {
        this.loading.set(false);

        this.errorMessage.set(
          'Falta información de entrega guardada en este dispositivo. Conéctese una vez para preparar el checkout.'
        );

        return;
      }

      this.cart.cart.set(
        cachedCart
      );

      this.applyCheckoutContext(
        context.addresses,
        context.warehouses
      );

      if (
        cachedCart.items.length === 0
      ) {
        this.errorMessage.set(
          'La bolsa guardada está vacía. Cuando vuelva la conexión podrá agregar productos nuevamente.'
        );
      }

      this.loading.set(false);
    }
    catch (error: unknown) {
      this.loading.set(false);

      this.errorMessage.set(
        error instanceof Error &&
        error.message.trim().length
          ? error.message
          : 'No fue posible recuperar su compra guardada en este dispositivo.'
      );
    }
  }

  private applyCheckoutContext(
    addresses: CustomerAddress[],
    warehouses: CheckoutWarehouse[]
  ): void {
    this.addresses.set(
      addresses
    );

    this.warehouses.set(
      warehouses
    );

    if (warehouses.length) {
      this.form.controls
        .warehouseId
        .setValue(
          warehouses[0]
            .warehouseId
        );
    }

    const defaultAddress =
      addresses.find(
        (address) =>
          address.defaultAddress
      ) ?? addresses[0];

    if (defaultAddress) {
      this.form.controls
        .addressId
        .setValue(
          defaultAddress.id
        );
    }
    else {
      this.form.controls
        .addressId
        .setValue('');
    }
  }
  private optional(
    value: string
  ): string | null {
    const normalized =
      value.trim();

    return normalized.length
      ? normalized
      : null;
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