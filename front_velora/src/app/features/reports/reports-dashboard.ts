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
  ReportOverview,
  ReportPeriodBounds
} from '../../core/reports/report.models';

import {
  ReportService
} from '../../core/reports/report.service';

import {
  FeedbackService
} from '../../core/feedback/feedback.service';

import {
  RoleShell
} from '../../shared/role-shell/role-shell';

import {
  ReportChartCard
} from './report-chart-card';

type ReportPeriodPreset =
  | '7D'
  | '30D'
  | '90D'
  | '180D'
  | '365D'
  | 'HISTORICAL'
  | 'CUSTOM'
  | 'AI';

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

  private readonly feedback =
    inject(FeedbackService);

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

  readonly fromDate =
    new FormControl(
      '',
      {
        nonNullable: true,
        validators: [
          Validators.required
        ]
      }
    );

  readonly toDate =
    new FormControl(
      '',
      {
        nonNullable: true,
        validators: [
          Validators.required
        ]
      }
    );

  readonly report =
    signal<ReportOverview | null>(null);

  readonly periodBounds =
    signal<ReportPeriodBounds | null>(null);

  readonly activePreset =
    signal<ReportPeriodPreset>('30D');

  readonly intent =
    signal<ReportAiIntent | null>(null);

  readonly narrative =
    signal<ReportAiNarrativeResponse | null>(null);

  readonly lastQuestion =
    signal<string | null>(null);

  readonly loading =
    signal(true);

  readonly aiLoading =
    signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly topTable =
    computed(() => {
      const tables =
        this.report()?.tables ?? [];

      return tables.length > 0
        ? tables[0]
        : null;
    });

  constructor() {
    this.loadPeriodBounds();
    this.loadOverview();
  }

  loadOverview(
    fromDate?: string | null,
    toDate?: string | null
  ): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.reports
      .overview(
        fromDate,
        toDate
      )
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.syncDates(report);
          this.intent.set(null);
          this.narrative.set(null);
          this.lastQuestion.set(null);
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

  refreshSelectedRange(): void {
    this.applyCustomRange(false);
  }

  applyPreset(
    preset: ReportPeriodPreset
  ): void {
    const bounds =
      this.periodBounds();

    const current =
      this.report();

    const maxDate =
      bounds?.maxDate ??
      current?.to;

    if (!maxDate) {
      return;
    }

    let from =
      maxDate;

    switch (preset) {
      case '7D':
        from =
          this.shiftDays(
            maxDate,
            -6
          );
        break;
      case '30D':
        from =
          this.shiftDays(
            maxDate,
            -29
          );
        break;
      case '90D':
        from =
          this.shiftDays(
            maxDate,
            -89
          );
        break;
      case '180D':
        from =
          this.shiftDays(
            maxDate,
            -179
          );
        break;
      case '365D':
        from =
          this.shiftDays(
            maxDate,
            -364
          );
        break;
      case 'HISTORICAL':
        from =
          bounds?.minDate ??
          this.shiftDays(
            maxDate,
            -729
          );
        break;
      default:
        return;
    }

    const minDate =
      bounds?.minDate;

    if (
      minDate &&
      from < minDate
    ) {
      from = minDate;
    }

    this.activePreset.set(preset);
    this.fromDate.setValue(from);
    this.toDate.setValue(maxDate);
    this.loadOverview(
      from,
      maxDate
    );
  }

  applyCustomRange(
    showFeedback = true
  ): void {
    if (
      this.fromDate.invalid ||
      this.toDate.invalid
    ) {
      this.fromDate.markAsTouched();
      this.toDate.markAsTouched();
      return;
    }

    const from =
      this.fromDate.value;

    const to =
      this.toDate.value;

    if (from > to) {
      this.errorMessage.set(
        'La fecha inicial no puede ser posterior a la fecha final.'
      );
      return;
    }

    this.activePreset.set('CUSTOM');
    this.loadOverview(
      from,
      to
    );

    if (showFeedback) {
      this.feedback.info(
        'Período aplicado',
        `${from} — ${to}. Esta actualización no usa IA.`
      );
    }
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
      .query(
        question,
        this.fromDate.value || null,
        this.toDate.value || null
      )
      .subscribe({
        next: (response) => {
          this.report.set(response.report);
          this.syncDates(response.report);
          this.intent.set(response.intent);
          this.narrative.set(response.narrative);
          this.lastQuestion.set(response.question);
          this.activePreset.set('AI');
          this.aiLoading.set(false);

          this.feedback.success(
            'Reporte generado con VÉLORA AI',
            `Período aplicado: ${response.report.from} — ${response.report.to}.`
          );
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

  private loadPeriodBounds(): void {
    this.reports
      .periodBounds()
      .subscribe({
        next: (bounds) => {
          this.periodBounds.set(bounds);
        },
        error: () => {
          this.periodBounds.set(null);
        }
      });
  }

  private syncDates(
    report: ReportOverview
  ): void {
    this.fromDate.setValue(
      report.from
    );

    this.toDate.setValue(
      report.to
    );
  }

  private shiftDays(
    isoDate: string,
    days: number
  ): string {
    const date =
      new Date(
        `${isoDate}T12:00:00Z`
      );

    date.setUTCDate(
      date.getUTCDate() + days
    );

    return date
      .toISOString()
      .slice(0, 10);
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
