import {
  DatePipe
} from '@angular/common';

import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  inject,
  signal
} from '@angular/core';

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
  Order
} from '../../core/order/order.models';

import {
  OrderService
} from '../../core/order/order.service';

import {
  Payment,
  PaymentMethod
} from '../../core/payment/payment.models';

import {
  PaymentService
} from '../../core/payment/payment.service';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

interface PaymentOption {
  value: PaymentMethod;
  label: string;
  description: string;
}

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [
    AuthenticatedShell,
    DatePipe
  ],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss'
})
export class MyOrders {
  readonly auth = inject(AuthService);

  private readonly ordersService =
    inject(OrderService);

  private readonly paymentsService =
    inject(PaymentService);

  private readonly router =
    inject(Router);

  readonly orders =
    signal<Order[]>([]);

  readonly paymentsByOrder =
    signal<Record<string, Payment[]>>({});

  readonly selectedMethods =
    signal<Record<string, PaymentMethod>>({});

  readonly loading =
    signal(true);

  readonly busyOrderId =
    signal<string | null>(null);

  readonly busyPaymentId =
    signal<string | null>(null);

  readonly successMessage =
    signal<string | null>(null);

  readonly errorMessage =
    signal<string | null>(null);

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

  private readonly methods: PaymentOption[] = [
    {
      value: 'COD',
      label: 'Contra entrega',
      description:
        'El pago se confirma al entregar el pedido.'
    },
    {
      value: 'CASH',
      label: 'Efectivo en sucursal',
      description:
        'Pago presencial al recoger la compra.'
    },
    {
      value: 'CARD',
      label: 'Tarjeta',
      description:
        'Tarjeta de débito o crédito.'
    },
    {
      value: 'QR',
      label: 'QR',
      description:
        'Pago mediante código QR.'
    },
    {
      value: 'WEB',
      label: 'Pago web',
      description:
        'Pago mediante proveedor web.'
    }
  ];

  constructor() {
    this.load();
  }

  userLabel(): string {
    const user =
      this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Cliente';
  }

  paymentOptions(
    order: Order
  ): PaymentOption[] {
    /*
     * DELIVERY:
     *   Contra entrega sí.
     *   Efectivo en sucursal no.
     *
     * PICKUP:
     *   Efectivo en sucursal sí.
     *   Contra entrega no.
     */
    return this.methods.filter(
      (option) => {
        if (
          order.fulfillmentType ===
            'DELIVERY'
        ) {
          return option.value !==
            'CASH';
        }

        if (
          order.fulfillmentType ===
            'PICKUP'
        ) {
          return option.value !==
            'COD';
        }

        return true;
      }
    );
  }

  selectedMethod(
    order: Order
  ): PaymentMethod {
    return this.selectedMethods()[
      order.id
    ] ?? (
      order.fulfillmentType ===
        'DELIVERY'
        ? 'COD'
        : 'CASH'
    );
  }

  chooseMethod(
    orderId: string,
    method: string
  ): void {
    this.selectedMethods.update(
      (current) => ({
        ...current,
        [orderId]:
          method as PaymentMethod
      })
    );

    this.clearMessages();
  }

  paymentsFor(
    orderId: string
  ): Payment[] {
    return this.paymentsByOrder()[
      orderId
    ] ?? [];
  }

  activePayment(
    orderId: string
  ): Payment | null {
    return this.paymentsFor(
      orderId
    ).find(
      (payment) =>
        payment.status ===
          'PENDING' ||
        payment.status ===
          'PAID'
    ) ?? null;
  }

  latestPayment(
    orderId: string
  ): Payment | null {
    return this.paymentsFor(
      orderId
    )[0] ?? null;
  }

  createPayment(
    order: Order
  ): void {
    this.clearMessages();

    if (
      order.status !== 'RESERVED'
    ) {
      return;
    }

    if (
      this.activePayment(
        order.id
      )
    ) {
      this.errorMessage.set(
        'El pedido ya tiene un pago pendiente o confirmado.'
      );

      return;
    }

    const method =
      this.selectedMethod(order);

    this.busyOrderId.set(
      order.id
    );

    this.paymentsService.create(
      order.id,
      {
        method,
        notes:
          `Pago ${method} iniciado desde el portal web VÉLORA.`
      }
    ).subscribe({
      next: (payment) => {
        this.busyOrderId.set(null);

        this.paymentsByOrder.update(
          (current) => ({
            ...current,
            [order.id]: [
              payment,
              ...(current[
                order.id
              ] ?? [])
            ]
          })
        );

        if (
          method === 'CARD' ||
          method === 'QR' ||
          method === 'WEB'
        ) {
          this.successMessage.set(
            'La solicitud de pago fue registrada. Permanecerá pendiente hasta que el proveedor de pago o la operación VÉLORA la confirme.'
          );
        }
        else if (
          method === 'COD'
        ) {
          this.successMessage.set(
            'Pago contra entrega registrado correctamente.'
          );
        }
        else {
          this.successMessage.set(
            'Pago en efectivo registrado correctamente.'
          );
        }
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyOrderId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible iniciar el pago.'
          )
        );
      }
    });
  }

  cancelPayment(
    payment: Payment
  ): void {
    if (
      payment.status !==
        'PENDING'
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        '¿Cancelar este intento de pago? El pedido continuará reservado.'
      );

    if (!confirmed) {
      return;
    }

    this.clearMessages();

    this.busyPaymentId.set(
      payment.id
    );

    this.paymentsService.cancel(
      payment.id,
      'Pago cancelado por el cliente desde el portal web.'
    ).subscribe({
      next: (updated) => {
        this.busyPaymentId.set(null);

        this.paymentsByOrder.update(
          (current) => ({
            ...current,
            [payment.orderId]:
              (
                current[
                  payment.orderId
                ] ?? []
              ).map(
                (candidate) =>
                  candidate.id ===
                    updated.id
                    ? updated
                    : candidate
              )
          })
        );

        this.successMessage.set(
          'El pago pendiente fue cancelado. Puede seleccionar otro método o cancelar el pedido.'
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyPaymentId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cancelar el pago.'
          )
        );
      }
    });
  }

  cancelOrder(
    order: Order
  ): void {
    if (
      order.status !==
        'RESERVED'
    ) {
      return;
    }

    if (
      this.activePayment(
        order.id
      )
    ) {
      this.errorMessage.set(
        'Primero debe cancelar el pago pendiente. Un pedido con pago confirmado no puede cancelarse directamente.'
      );

      return;
    }

    if (
      !window.confirm(
        `¿Cancelar el pedido ${order.orderNumber}? El inventario reservado será liberado.`
      )
    ) {
      return;
    }

    this.clearMessages();

    this.busyOrderId.set(
      order.id
    );

    this.ordersService.cancel(
      order.id
    ).subscribe({
      next: (updated) => {
        this.busyOrderId.set(null);

        this.orders.update(
          (current) =>
            current.map(
              (candidate) =>
                candidate.id ===
                  updated.id
                  ? updated
                  : candidate
            )
        );

        this.successMessage.set(
          'Pedido cancelado. Las unidades reservadas fueron liberadas.'
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyOrderId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cancelar el pedido.'
          )
        );
      }
    });
  }

  orderStatusLabel(
    order: Order
  ): string {
    switch (order.status) {
      case 'RESERVED':
        return 'Reservado';

      case 'FULFILLED':
        return 'Entregado';

      case 'CANCELLED':
        return 'Cancelado';
    }
  }

  paymentStatusLabel(
    payment: Payment
  ): string {
    switch (payment.status) {
      case 'PENDING':
        return 'Pendiente';

      case 'PAID':
        return 'Pagado';

      case 'FAILED':
        return 'Fallido';

      case 'CANCELLED':
        return 'Cancelado';

      case 'REFUNDED':
        return 'Reembolsado';
    }
  }

  paymentMethodLabel(
    method: PaymentMethod
  ): string {
    return this.methods.find(
      (candidate) =>
        candidate.value === method
    )?.label ?? method;
  }

  paymentDescription(
    order: Order
  ): string {
    const selected =
      this.selectedMethod(order);

    return this.methods.find(
      (candidate) =>
        candidate.value === selected
    )?.description ?? '';
  }

  goToCatalog(): void {
    void this.router.navigate(
      ['/catalogo']
    );
  }

  logout(): void {
    this.auth.logout();

    void this.router.navigate(
      ['/']
    );
  }

  private load(): void {
    this.loading.set(true);
    this.clearMessages();

    this.ordersService.list().subscribe({
      next: (orders) => {
        this.orders.set(orders);

        const initialMethods:
          Record<string, PaymentMethod> = {};

        for (const order of orders) {
          initialMethods[order.id] =
            order.fulfillmentType ===
              'DELIVERY'
              ? 'COD'
              : 'CASH';
        }

        this.selectedMethods.set(
          initialMethods
        );

        if (!orders.length) {
          this.paymentsByOrder.set({});
          this.loading.set(false);
          return;
        }

        forkJoin(
          orders.map(
            (order) =>
              this.paymentsService
                .listForOrder(
                  order.id
                )
          )
        ).subscribe({
          next: (paymentLists) => {
            const map:
              Record<string, Payment[]> = {};

            orders.forEach(
              (order, index) => {
                map[order.id] =
                  paymentLists[index];
              }
            );

            this.paymentsByOrder.set(
              map
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
                'No fue posible cargar los pagos de sus pedidos.'
              )
            );
          }
        });
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar sus pedidos.'
          )
        );
      }
    });
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