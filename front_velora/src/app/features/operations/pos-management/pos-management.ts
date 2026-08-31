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
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  Router
} from '@angular/router';

import {
  AuthService
} from '../../../core/auth/auth.service';

import {
  PosOfflineQueueService
} from '../../../core/offline/pos-offline-queue.service';

import {
  CashMovement,
  CashMovementType,
  CashSession,
  PointOfSale
} from '../../../core/pos/pos.models';

import {
  PosService
} from '../../../core/pos/pos.service';

import {
  PosSalePanel
} from './pos-sale-panel';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../../shared/authenticated-shell/authenticated-shell';

@Component({
  selector: 'app-pos-management',
  standalone: true,
  imports: [
    AuthenticatedShell,
    ReactiveFormsModule,
    DatePipe,
    PosSalePanel
  ],
  templateUrl: './pos-management.html',
  styleUrl: './pos-management.scss'
})
export class PosManagement {
  readonly auth = inject(AuthService);

  private readonly pos =
    inject(PosService);

  readonly offline =
    inject(PosOfflineQueueService);

  private readonly router =
    inject(Router);

  private readonly fb =
    inject(FormBuilder);

  readonly pointsOfSale =
    signal<PointOfSale[]>([]);

  readonly selectedPointOfSaleId =
    signal<string | null>(null);

  readonly currentSession =
    signal<CashSession | null>(null);

  readonly lastClosedSession =
    signal<CashSession | null>(null);

  readonly movements =
    signal<CashMovement[]>([]);

  readonly loading =
    signal(true);

  readonly sessionLoading =
    signal(false);

  readonly busy =
    signal(false);

  readonly successMessage =
    signal<string | null>(null);

  readonly errorMessage =
    signal<string | null>(null);

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
            disabled: true
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
          label: 'Reportes',
          disabled: true
        }
      ];
    });

  readonly selectedPointOfSale =
    computed<PointOfSale | null>(() => {
      const id =
        this.selectedPointOfSaleId();

      return this.pointsOfSale().find(
        (point) =>
          point.id === id
      ) ?? null;
    });

  readonly cashInTotal =
    computed(() => {
      return this.movements()
        .filter(
          (movement) =>
            movement.movementType ===
              'CASH_IN'
        )
        .reduce(
          (total, movement) =>
            total +
            Number(movement.amount),
          0
        );
    });

  readonly cashOutTotal =
    computed(() => {
      return this.movements()
        .filter(
          (movement) =>
            movement.movementType ===
              'CASH_OUT'
        )
        .reduce(
          (total, movement) =>
            total +
            Number(movement.amount),
          0
        );
    });

  readonly openForm =
    this.fb.nonNullable.group({
      openingAmount: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      openingNotes: [
        '',
        Validators.maxLength(500)
      ]
    });

  readonly movementForm =
    this.fb.nonNullable.group({
      movementType:
        this.fb.nonNullable.control<
          CashMovementType
        >(
          'CASH_IN',
          Validators.required
        ),

      amount: [
        0,
        [
          Validators.required,
          Validators.min(0.01)
        ]
      ],

      reason: [
        '',
        [
          Validators.required,
          Validators.maxLength(500)
        ]
      ]
    });

  readonly closeForm =
    this.fb.nonNullable.group({
      countedCashAmount: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      closingNotes: [
        '',
        Validators.maxLength(500)
      ]
    });

  constructor() {
    this.loadPointsOfSale();
  }

  title(): string {
    return this.auth.currentUser()
      ?.role === 'ADMIN'
      ? 'POS y cajas'
      : (
          this.auth.currentUser()
            ?.storeName ||
          'POS y caja'
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

  selectPointOfSale(
    pointOfSaleId: string
  ): void {
    if (
      this.selectedPointOfSaleId() ===
        pointOfSaleId
    ) {
      return;
    }

    this.selectedPointOfSaleId.set(
      pointOfSaleId
    );

    this.currentSession.set(null);
    this.lastClosedSession.set(null);
    this.movements.set([]);

    this.clearMessages();

    this.loadOpenSession(
      pointOfSaleId
    );
  }

  openSession(): void {
    const point =
      this.selectedPointOfSale();

    if (
      !point ||
      !point.active ||
      this.openForm.invalid ||
      this.busy()
    ) {
      this.openForm.markAllAsTouched();
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    const value =
      this.openForm.getRawValue();

    this.pos.openSession({
      pointOfSaleId:
        point.id,

      openingAmount:
        Number(value.openingAmount),

      openingNotes:
        this.optional(
          value.openingNotes
        )
    }).subscribe({
      next: (session) => {
        this.busy.set(false);

        this.currentSession.set(
          session
        );

        this.lastClosedSession.set(
          null
        );

        this.openForm.reset({
          openingAmount: 0,
          openingNotes: ''
        });

        this.successMessage.set(
          `Caja ${session.sessionNumber} abierta correctamente.`
        );

        this.loadMovements(
          session.id
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible abrir la caja.'
          )
        );
      }
    });
  }

  registerMovement(): void {
    const session =
      this.currentSession();

    if (
      !session ||
      this.movementForm.invalid ||
      this.busy()
    ) {
      this.movementForm.markAllAsTouched();
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    const value =
      this.movementForm.getRawValue();

    this.pos.registerMovement(
      session.id,
      {
        movementType:
          value.movementType,

        amount:
          Number(value.amount),

        reason:
          value.reason.trim()
      }
    ).subscribe({
      next: (movement) => {
        this.busy.set(false);

        this.movements.update(
          (current) => [
            movement,
            ...current
          ]
        );

        this.movementForm.reset({
          movementType:
            value.movementType,

          amount: 0,

          reason: ''
        });

        this.successMessage.set(
          value.movementType ===
            'CASH_IN'
            ? 'Entrada de efectivo registrada.'
            : 'Salida de efectivo registrada.'
        );

        this.refreshCurrentSession();
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible registrar el movimiento.'
          )
        );
      }
    });
  }

  closeSession(): void {
    const session =
      this.currentSession();

    if (
      !session ||
      this.closeForm.invalid ||
      this.busy()
    ) {
      this.closeForm.markAllAsTouched();
      return;
    }

    if (!this.offline.ready()) {
      this.errorMessage.set(
        'Se está verificando la cola local del POS. Intente nuevamente.'
      );

      return;
    }

    if (!this.offline.online()) {
      this.errorMessage.set(
        'No es posible cerrar la caja sin conexión.'
      );

      return;
    }

    const localPending =
      this.offline.pendingForSession(
        session.id
      );

    if (localPending > 0) {
      this.errorMessage.set(
        `No se puede cerrar la caja: existen ${localPending} venta(s) locales pendientes de sincronización.`
      );

      return;
    }

    if (
      !window.confirm(
        `¿Cerrar la caja ${session.sessionNumber}?`
      )
    ) {
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    const value =
      this.closeForm.getRawValue();

    this.pos.closeSession(
      session.id,
      {
        countedCashAmount:
          Number(
            value.countedCashAmount
          ),

        closingNotes:
          this.optional(
            value.closingNotes
          )
      }
    ).subscribe({
      next: (closed) => {
        this.busy.set(false);

        this.lastClosedSession.set(
          closed
        );

        this.currentSession.set(
          null
        );

        this.movements.set([]);

        this.closeForm.reset({
          countedCashAmount: 0,
          closingNotes: ''
        });

        this.successMessage.set(
          `Caja ${closed.sessionNumber} cerrada correctamente.`
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cerrar la caja.'
          )
        );
      }
    });
  }

  logout(): void {
    this.auth.logout();

    void this.router.navigate(
      ['/']
    );
  }

  private loadPointsOfSale(): void {
    this.loading.set(true);
    this.clearMessages();

    this.pos.pointsOfSale().subscribe({
      next: (points) => {
        this.pointsOfSale.set(
          points
        );

        this.loading.set(false);

        const firstActive =
          points.find(
            (point) =>
              point.active
          );

        const first =
          firstActive ??
          points[0];

        if (!first) {
          return;
        }

        this.selectedPointOfSaleId.set(
          first.id
        );

        this.loadOpenSession(
          first.id
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar los puntos de venta.'
          )
        );
      }
    });
  }

  private loadOpenSession(
    pointOfSaleId: string
  ): void {
    this.sessionLoading.set(true);

    this.pos.getOpenSession(
      pointOfSaleId
    ).subscribe({
      next: (session) => {
        this.sessionLoading.set(false);

        this.currentSession.set(
          session
        );

        this.closeForm.controls
          .countedCashAmount
          .setValue(
            Number(
              session.expectedCashAmount
            )
          );

        this.loadMovements(
          session.id
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.sessionLoading.set(false);

        if (error.status === 404) {
          this.currentSession.set(null);
          this.movements.set([]);
          return;
        }

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible consultar la caja abierta.'
          )
        );
      }
    });
  }

  private loadMovements(
    sessionId: string
  ): void {
    this.pos.movements(
      sessionId
    ).subscribe({
      next: (movements) => {
        this.movements.set(
          [...movements].sort(
            (a, b) =>
              new Date(
                b.createdAt
              ).getTime() -
              new Date(
                a.createdAt
              ).getTime()
          )
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar los movimientos de caja.'
          )
        );
      }
    });
  }

  refreshCurrentSession(): void {
    const pointId =
      this.selectedPointOfSaleId();

    if (!pointId) {
      return;
    }

    this.pos.getOpenSession(
      pointId
    ).subscribe({
      next: (session) => {
        this.currentSession.set(
          session
        );

        this.closeForm.controls
          .countedCashAmount
          .setValue(
            Number(
              session.expectedCashAmount
            )
          );
      },

      error: () => undefined
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