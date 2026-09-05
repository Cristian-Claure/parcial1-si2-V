import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  DatePipe
} from '@angular/common';

import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule
} from '@angular/forms';

import {
  AuditEvent,
  AuditEventPage,
  AuditService
} from '../../../core/audit/audit.service';

import {
  FeedbackService
} from '../../../core/feedback/feedback.service';

import {
  RoleShell
} from '../../../shared/role-shell/role-shell';

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    RoleShell
  ],
  templateUrl: './admin-audit.html',
  styleUrl: './admin-audit.scss'
})
export class AdminAuditPage {
  private readonly audit =
    inject(AuditService);

  private readonly feedback =
    inject(FeedbackService);

  private readonly fb =
    inject(FormBuilder);

  readonly loading =
    signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly data =
    signal<AuditEventPage | null>(null);

  readonly filters =
    this.fb.nonNullable.group({
      q: '',
      role: '',
      category: '',
      method: '',
      success: '',
      from: '',
      to: '',
      size: 25
    });

  constructor() {
    this.load(0);
  }

  applyFilters(): void {
    this.load(0);
  }

  clearFilters(): void {
    this.filters.reset({
      q: '',
      role: '',
      category: '',
      method: '',
      success: '',
      from: '',
      to: '',
      size: 25
    });

    this.load(0);
  }

  refresh(): void {
    this.load(
      this.data()?.page ?? 0
    );
  }

  previousPage(): void {
    const current =
      this.data();

    if (
      !current ||
      current.page <= 0 ||
      this.loading()
    ) {
      return;
    }

    this.load(
      current.page - 1
    );
  }

  nextPage(): void {
    const current =
      this.data();

    if (
      !current ||
      current.page + 1 >=
        current.totalPages ||
      this.loading()
    ) {
      return;
    }

    this.load(
      current.page + 1
    );
  }

  actorLabel(
    event: AuditEvent
  ): string {
    return (
      event.actorName?.trim() ||
      event.actorEmail?.trim() ||
      (
        event.actorUserId
          ? 'Usuario autenticado'
          : 'Sistema / anónimo'
      )
    );
  }

  categoryLabel(
    category: string
  ): string {
    const labels:
      Record<string, string> = {
        ADMIN: 'Administración',
        CATALOG: 'Catálogo',
        INVENTORY: 'Inventario',
        ORDERS: 'Pedidos',
        PAYMENTS: 'Pagos',
        POS: 'POS y caja',
        TRY_ON: 'Probador virtual',
        REPORTS_AI: 'Reportes e IA',
        PUSH: 'Notificaciones',
        CUSTOMER: 'Cliente',
        OTHER: 'Otros'
      };

    return (
      labels[category] ??
      category
    );
  }

  methodLabel(
    method: string
  ): string {
    switch (method) {
      case 'POST':
        return 'Crear / ejecutar';
      case 'PUT':
        return 'Actualizar';
      case 'PATCH':
        return 'Modificar';
      case 'DELETE':
        return 'Eliminar';
      default:
        return method;
    }
  }

  private load(
    page: number
  ): void {
    if (this.loading()) {
      return;
    }

    const raw =
      this.filters.getRawValue();

    const success =
      raw.success === 'true'
        ? true
        : raw.success === 'false'
          ? false
          : null;

    this.loading.set(true);
    this.errorMessage.set(null);

    this.audit.search({
      q: raw.q,
      role: raw.role,
      category: raw.category,
      method: raw.method,
      success,
      from:
        this.toIso(
          raw.from
        ),
      to:
        this.toIso(
          raw.to
        ),
      page,
      size:
        Number(raw.size) || 25
    }).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        const message =
          this.readError(
            error,
            'No fue posible consultar la bitácora del sistema.'
          );

        this.errorMessage.set(
          message
        );

        this.feedback.error(
          'Auditoría no disponible',
          message
        );

        this.loading.set(false);
      }
    });
  }

  private toIso(
    value: string
  ): string | null {
    const normalized =
      value.trim();

    if (!normalized) {
      return null;
    }

    const parsed =
      new Date(normalized);

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return null;
    }

    return parsed.toISOString();
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const message =
      error.error?.message;

    return (
      typeof message === 'string' &&
      message.trim().length > 0
    )
      ? message
      : fallback;
  }
}
