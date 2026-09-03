import {
  DatePipe
} from '@angular/common';

import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  Router
} from '@angular/router';

import {
  AuthService
} from '../../../core/auth/auth.service';

import {
  ConfirmService
} from '../../../core/feedback/confirm.service';

import {
  OperationalOrder,
  OrderChannel
} from '../../../core/commerce-operations/commerce-operations.models';

import {
  CommerceOperationsService
} from '../../../core/commerce-operations/commerce-operations.service';

import {
  OrderStatus
} from '../../../core/order/order.models';

import {
  Payment,
  PaymentMethod
} from '../../../core/payment/payment.models';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../../shared/authenticated-shell/authenticated-shell';

type StatusFilter =
  | 'ALL'
  | OrderStatus;

type ChannelFilter =
  | 'ALL'
  | OrderChannel;

@Component({
  selector: 'app-orders-management',
  standalone: true,
  imports: [
    AuthenticatedShell,
    DatePipe
  ],
  templateUrl: './orders-management.html',
  styleUrl: './orders-management.scss'
})
export class OrdersManagement {
  readonly auth = inject(AuthService);

  private readonly commerce =
    inject(CommerceOperationsService);

  private readonly confirm =
    inject(ConfirmService);

  private readonly router =
    inject(Router);

  readonly orders =
    signal<OperationalOrder[]>([]);

  readonly loading =
    signal(true);

  readonly busyId =
    signal<string | null>(null);

  readonly successMessage =
    signal<string | null>(null);

  readonly errorMessage =
    signal<string | null>(null);

  readonly statusFilter =
    signal<StatusFilter>('ALL');

  readonly channelFilter =
    signal<ChannelFilter>('ALL');

  readonly storeFilter =
    signal('ALL');

  readonly navItems =
    computed<ShellNavItem[]>(() => {
      const role =
        this.auth.currentUser()?.role;

      if (role === 'ADMIN') {
        return [
          {
            label: 'Dashboard',
            route: '/admin'
          },
          {
            label: 'Sucursales',
            route: '/admin'
          },
          {
            label: 'Usuarios y encargados',
            route: '/admin'
          },
          {
            label: 'Catálogo',
            route: '/admin/catalogo'
          },
          {
            label: 'Inventario',
            route: '/admin/inventario'
          },
          {
            label: 'Pedidos y ventas',
            route: '/admin/pedidos'
          },
          {
            label: 'POS y cajas',
            route: '/admin/pos'
          },
          {
            label: 'Reportes IA',
            route: '/admin/reportes'
          },
          {
            label: 'Auditoría',
            disabled: true
          },
          {
            label: 'Configuración',
            disabled: true
          }
        ];
      }

      return [
        {
          label: 'Dashboard',
          route: '/sucursal'
        },
        {
          label: 'Catálogo',
          route: '/sucursal/catalogo'
        },
        {
          label: 'Inventario',
          route: '/sucursal/inventario'
        },
        {
          label: 'Pedidos y ventas',
          route: '/sucursal/pedidos'
        },
        {
          label: 'POS y caja',
          route: '/sucursal/pos'
        },
        {
          label: 'Reportes IA',
          route: '/sucursal/reportes'
        }
      ];
    });

  readonly stores = computed(() => {
    const unique =
      new Map<string, string>();

    for (const order of this.orders()) {
      unique.set(
        order.storeId,
        order.storeName
      );
    }

    return Array.from(
      unique.entries()
    )
      .map(
        ([id, name]) => ({
          id,
          name
        })
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name,
            'es'
          )
      );
  });

  readonly visibleOrders =
    computed(() => {
      return this.orders().filter(
        (order) => {
          if (
            this.statusFilter() !==
              'ALL' &&
            order.status !==
              this.statusFilter()
          ) {
            return false;
          }

          if (
            this.channelFilter() !==
              'ALL' &&
            order.orderChannel !==
              this.channelFilter()
          ) {
            return false;
          }

          if (
            this.storeFilter() !==
              'ALL' &&
            order.storeId !==
              this.storeFilter()
          ) {
            return false;
          }

          return true;
        }
      );
    });

  constructor() {
    this.load();
  }

  title(): string {
    return this.auth.currentUser()
      ?.role === 'ADMIN'
      ? 'Pedidos y ventas'
      : (
          this.auth.currentUser()
            ?.storeName ||
          'Operación de sucursal'
        );
  }

  subtitle(): string {
    return this.auth.currentUser()
      ?.role === 'ADMIN'
      ? 'Backoffice VÉLORA'
      : 'Operación de sucursal';
  }

  userLabel(): string {
    const user =
      this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : '';
  }

  setStatusFilter(
    value: string
  ): void {
    this.statusFilter.set(
      value as StatusFilter
    );
  }

  setChannelFilter(
    value: string
  ): void {
    this.channelFilter.set(
      value as ChannelFilter
    );
  }

  setStoreFilter(
    value: string
  ): void {
    this.storeFilter.set(value);
  }

  paidPayment(
    order: OperationalOrder
  ): Payment | null {
    return order.payments.find(
      (payment) =>
        payment.status === 'PAID'
    ) ?? null;
  }

  pendingPayment(
    order: OperationalOrder
  ): Payment | null {
    return order.payments.find(
      (payment) =>
        payment.status === 'PENDING'
    ) ?? null;
  }

  latestPayment(
    order: OperationalOrder
  ): Payment | null {
    return order.payments[0] ?? null;
  }

  canFulfill(
    order: OperationalOrder
  ): boolean {
    return (
      order.status === 'RESERVED' &&
      Boolean(
        this.paidPayment(order)
      )
    );
  }

  async confirmPayment(
    payment: Payment
  ): Promise<void> {
    if (
      payment.status !== 'PENDING'
    ) {
      return;
    }

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'PAGO',
        title: '¿Confirmar este pago?',
        message:
          `${this.paymentMethodLabel(payment.method)} · Bs ${payment.amount}. Esta acción registrará el pago como confirmado.`,
        confirmLabel: 'Confirmar pago',
        cancelLabel: 'Volver'
      });

    if (!confirmed) {
      return;
    }

    this.clearMessages();
    this.busyId.set(payment.id);

    this.commerce.confirmPayment(
      payment.id,
      'Pago confirmado desde el backoffice web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busyId.set(null);

        this.successMessage.set(
          'Pago confirmado correctamente.'
        );

        this.reloadAfterAction();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible confirmar el pago.'
          )
        );
      }
    });
  }

  async failPayment(
    payment: Payment
  ): Promise<void> {
    if (
      payment.status !== 'PENDING'
    ) {
      return;
    }

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'PAGO',
        title: '¿Marcar este pago como fallido?',
        message:
          'El intento quedará cerrado y no podrá confirmarse posteriormente desde este flujo.',
        confirmLabel: 'Marcar fallido',
        cancelLabel: 'Conservar pago',
        destructive: true
      });

    if (!confirmed) {
      return;
    }

    this.clearMessages();
    this.busyId.set(payment.id);

    this.commerce.failPayment(
      payment.id,
      'Pago marcado como fallido desde el backoffice web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busyId.set(null);

        this.successMessage.set(
          'El pago fue marcado como fallido.'
        );

        this.reloadAfterAction();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible marcar el pago como fallido.'
          )
        );
      }
    });
  }

  async refundPayment(
    payment: Payment
  ): Promise<void> {
    if (
      payment.status !== 'PAID'
    ) {
      return;
    }

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'REEMBOLSO',
        title: `¿Reembolsar Bs ${payment.amount}?`,
        message:
          payment.provider === 'STRIPE'
            ? 'VÉLORA solicitará el reembolso real a Stripe. El estado local sólo cambiará cuando Stripe confirme la operación.'
            : 'El pago será registrado como reembolsado en VÉLORA.',
        confirmLabel: 'Reembolsar pago',
        cancelLabel: 'Conservar pago',
        destructive: true
      });

    if (!confirmed) {
      return;
    }

    this.clearMessages();
    this.busyId.set(payment.id);

    this.commerce.refundPayment(
      payment.id,
      'Reembolso registrado desde el backoffice web VÉLORA.'
    ).subscribe({
      next: () => {
        this.busyId.set(null);

        this.successMessage.set(
          'Reembolso registrado correctamente.'
        );

        this.reloadAfterAction();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible registrar el reembolso.'
          )
        );
      }
    });
  }

  async fulfillOrder(
    order: OperationalOrder
  ): Promise<void> {
    if (!this.canFulfill(order)) {
      this.errorMessage.set(
        'El pedido debe estar reservado y tener un pago confirmado.'
      );

      return;
    }

    const confirmed =
      await this.confirm.ask({
        eyebrow: 'ENTREGA',
        title: `¿Completar ${order.orderNumber}?`,
        message:
          'La reserva se convertirá en salida física de inventario y el pedido quedará completado.',
        confirmLabel:
          order.fulfillmentType === 'DELIVERY'
            ? 'Confirmar entrega'
            : order.fulfillmentType === 'PICKUP'
              ? 'Confirmar recojo'
              : 'Completar venta',
        cancelLabel: 'Volver'
      });

    if (!confirmed) {
      return;
    }

    this.clearMessages();
    this.busyId.set(order.id);

    this.commerce.fulfillOrder(
      order.id
    ).subscribe({
      next: () => {
        this.busyId.set(null);

        this.successMessage.set(
          'Pedido completado. La reserva fue convertida en salida física de inventario.'
        );

        this.reloadAfterAction();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busyId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible completar el pedido.'
          )
        );
      }
    });
  }

  orderStatusLabel(
    order: OperationalOrder
  ): string {
    switch (order.status) {
      case 'RESERVED':
        return 'Reservado';

      case 'FULFILLED':
        return 'Completado';

      case 'CANCELLED':
        return 'Cancelado';
    }
  }

  channelLabel(
    channel: OrderChannel
  ): string {
    return channel === 'POS'
      ? 'POS'
      : 'Ecommerce';
  }

  fulfillmentLabel(
    order: OperationalOrder
  ): string {
    switch (order.fulfillmentType) {
      case 'DELIVERY':
        return 'Envío';

      case 'PICKUP':
        return 'Recojo';

      case 'IN_STORE':
        return 'Venta en tienda';
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
    switch (method) {
      case 'COD':
        return 'Contra entrega';

      case 'CASH':
        return 'Efectivo';

      case 'CARD':
        return 'Tarjeta';

      case 'QR':
        return 'QR';

      case 'WEB':
        return 'Pago web';
    }
  }

  logout(): void {
    this.auth.logout();

    void this.router.navigate(
      ['/']
    );
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.commerce.listOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar los pedidos.'
          )
        );
      }
    });
  }

  private reloadAfterAction(): void {
    this.commerce.listOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.errorMessage.set(
          this.readError(
            error,
            'La operación se completó, pero no fue posible refrescar la lista.'
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

    return typeof message === 'string' &&
      message.trim().length
      ? message
      : fallback;
  }
}