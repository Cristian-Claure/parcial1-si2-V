import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
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

  readonly navItems: ShellNavItem[] = [
    {
      label: 'Inicio',
      route: '/'
    },
    {
      label: 'Explorar productos',
      route: '/catalogo'
    },
    {
      label: 'Mi cuenta',
      route: '/mi-cuenta'
    },
    {
      label: 'Bolsa',
      route: '/bolsa'
    },
    {
      label: 'Mis pedidos',
      route: '/mis-pedidos'
    },
    {
      label: 'Favoritos',
      disabled: true
    },
    {
      label: 'Probador virtual',
      disabled: true
    }
  ];

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

        if (
          cart.items.length === 0
        ) {
          this.errorMessage.set(
            'No existen productos en la bolsa para generar un pedido.'
          );
        }

        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible preparar el checkout.'
          )
        );
      }
    });
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