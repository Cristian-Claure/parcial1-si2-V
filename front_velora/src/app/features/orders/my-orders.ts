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

import {
  CUSTOMER_NAV_ITEMS
} from '../../shared/customer-navigation';

import {
  ConfirmService
} from '../../core/feedback/confirm.service';

import {
  FeedbackService
} from '../../core/feedback/feedback.service';

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

  private readonly confirm =
    inject(ConfirmService);

  private readonly feedback =
    inject(FeedbackService);

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

  readonly navItems: ShellNavItem[] =
    CUSTOMER_NAV_ITEMS;

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

          this.feedback.info(
            'Pago online iniciado',
            'La solicitud quedó registrada y permanece pendiente de confirmación.'
          );
        }
        else if (
          method === 'COD'
        ) {
          this.successMessage.set(
            'Pago contra entrega registrado correctamente.'
          );

          this.feedback.success(
            'Método de pago registrado',
            'El pago contra entrega quedó asociado a su pedido.'
          );
        }
        else {
          this.successMessage.set(
            'Pago en efectivo registrado correctamente.'
          );

          this.feedback.success(
            'Método de pago registrado',
            'El pago en sucursal quedó asociado a su pedido.'
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

  async cancelPayment(
    payment: Payment
  ): Promise<void> {
    if (
      payment.status !==
        'PENDING'
    ) {
      return;
    }

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'PAGO',
        title:
          '¿Cancelar este intento de pago?',
        message:
          'El pedido continuará reservado y podrá seleccionar otro método de pago.',
        confirmLabel:
          'Cancelar pago',
        cancelLabel:
          'Mantener pago',
        destructive: true
      });

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

        this.feedback.success(
          'Pago cancelado',
          'Ahora puede elegir otro método de pago para este pedido.'
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

  async cancelOrder(
    order: Order
  ): Promise<void> {
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

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'PEDIDO',
        title:
          `¿Cancelar ${order.orderNumber}?`,
        message:
          'El inventario reservado será liberado y este pedido ya no podrá continuar.',
        confirmLabel:
          'Cancelar pedido',
        cancelLabel:
          'Conservar pedido',
        destructive: true
      });

    if (!confirmed) {
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

        this.feedback.success(
          'Pedido cancelado',
          'Las unidades reservadas volvieron a estar disponibles.'
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