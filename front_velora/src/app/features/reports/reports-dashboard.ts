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
  FormControl,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  ReportAiIntent,
  ReportAiNarrativeResponse,
  ReportKpi,
  ReportOverview
} from '../../core/reports/report.models';

import {
  ReportService
} from '../../core/reports/report.service';

import {
  RoleShell
} from '../../shared/role-shell/role-shell';

import {
  ReportChartCard
} from './report-chart-card';

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RoleShell,
    ReportChartCard
  ],
  templateUrl: './reports-dashboard.html',
  styleUrl: './reports-dashboard.scss'
})
export class ReportsDashboard {
  private readonly reports =
    inject(ReportService);

  readonly question =
    new FormControl(
      'Muéstrame un resumen general de los últimos 30 días.',
      {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(800)
        ]
      }
    );

  readonly report =
    signal<ReportOverview | null>(null);

  readonly intent =
    signal<ReportAiIntent | null>(null);

  readonly narrative =
    signal<ReportAiNarrativeResponse | null>(null);

  readonly loading =
    signal(true);

  readonly aiLoading =
    signal(false);

  readonly narrativeLoading =
    signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly activeInsights =
    computed(() => {
      const deep =
        this.narrative();

      if (
        deep &&
        deep.insights.length > 0
      ) {
        return deep.insights;
      }

      return (
        this.report()
          ?.deterministicInsights ??
        []
      );
    });

  readonly topTable =
    computed(() => {
      const tables =
        this.report()?.tables ?? [];

      return tables.length > 0
        ? tables[0]
        : null;
    });

  constructor() {
    this.loadOverview();
  }

  loadOverview(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.reports
      .overview()
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.intent.set(null);
          this.narrative.set(null);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(
            this.readError(
              error,
              'No fue posible cargar el reporte operativo.'
            )
          );
        }
      });
  }

  generateWithAi(): void {
    if (
      this.question.invalid ||
      this.aiLoading()
    ) {
      this.question.markAsTouched();
      return;
    }

    const question =
      this.question.value.trim();

    if (!question) {
      return;
    }

    this.aiLoading.set(true);
    this.errorMessage.set(null);
    this.narrative.set(null);

    this.reports
      .query(question)
      .subscribe({
        next: (response) => {
          this.report.set(response.report);
          this.intent.set(response.intent);
          this.aiLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.aiLoading.set(false);
          this.errorMessage.set(
            this.readError(
              error,
              'VÉLORA AI no pudo generar el reporte solicitado.'
            )
          );
        }
      });
  }

  deepenWithAi(): void {
    const current =
      this.report();

    if (
      !current ||
      this.narrativeLoading()
    ) {
      return;
    }

    const question =
      this.question.value.trim();

    if (!question) {
      return;
    }

    this.narrativeLoading.set(true);
    this.errorMessage.set(null);

    this.reports
      .narrative({
        question,
        fromDate: current.from,
        toDate: current.to,
        storeId:
          this.intent()?.storeId ??
          null
      })
      .subscribe({
        next: (narrative) => {
          this.narrative.set(narrative);
          this.narrativeLoading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.narrativeLoading.set(false);
          this.errorMessage.set(
            this.readError(
              error,
              'VÉLORA AI no pudo profundizar el análisis.'
            )
          );
        }
      });
  }

  formatKpi(
    kpi: ReportKpi
  ): string {
    if (kpi.format === 'CURRENCY') {
      return new Intl.NumberFormat(
        'es-BO',
        {
          style: 'currency',
          currency: 'BOB',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      ).format(kpi.value);
    }

    return new Intl.NumberFormat(
      'es-BO',
      {
        maximumFractionDigits: 0
      }
    ).format(kpi.value);
  }

  formatGeneratedAt(
    value: string
  ): string {
    const parsed =
      new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      'es-BO',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    ).format(parsed);
  }

  focusLabel(): string {
    const focus =
      this.intent()?.focus;

    switch (focus) {
      case 'SALES':
        return 'Ventas';
      case 'ORDERS':
        return 'Pedidos';
      case 'PAYMENTS':
        return 'Pagos';
      case 'INVENTORY':
        return 'Inventario';
      case 'PRODUCTS':
        return 'Productos';
      default:
        return 'Resumen operativo';
    }
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const detail =
      error.error?.detail ??
      error.error?.message;

    return typeof detail === 'string' &&
      detail.trim()
      ? detail
      : fallback;
  }
}