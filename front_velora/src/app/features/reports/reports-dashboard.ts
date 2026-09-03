import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  OnDestroy,
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

interface VoiceRecognitionAlternative {
  transcript: string;
}

interface VoiceRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: VoiceRecognitionAlternative;
}

interface VoiceRecognitionResultList {
  readonly length: number;
  readonly [index: number]: VoiceRecognitionResult;
}

interface VoiceRecognitionEvent extends Event {
  readonly results: VoiceRecognitionResultList;
}

interface VoiceRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: VoiceRecognitionEvent) => void)
    | null;
  onerror:
    | (() => void)
    | null;
  onend:
    | (() => void)
    | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface VoiceRecognitionConstructor {
  new(): VoiceRecognition;
}

interface VoiceRecognitionWindow extends Window {
  SpeechRecognition?:
    VoiceRecognitionConstructor;
  webkitSpeechRecognition?:
    VoiceRecognitionConstructor;
}

type VoiceInputState =
  | 'IDLE'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'ERROR';

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
export class ReportsDashboard implements OnDestroy {
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

  readonly voiceState =
    signal<VoiceInputState>('IDLE');

  readonly voiceError =
    signal<string | null>(null);

  readonly voiceSeconds =
    signal(0);

  readonly voiceLivePreview =
    signal(false);

  readonly voiceBusy =
    computed(() => {
      const state =
        this.voiceState();

      return (
        state === 'RECORDING' ||
        state === 'TRANSCRIBING'
      );
    });

  private voiceRecorder:
    MediaRecorder | null = null;

  private voiceRecognition:
    VoiceRecognition | null = null;

  private voiceStream:
    MediaStream | null = null;

  private voiceChunks: Blob[] = [];

  private voiceTimer:
    ReturnType<typeof setInterval> | null = null;

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

  ngOnDestroy(): void {
    this.cleanupVoiceCapture();
  }

  async toggleVoiceRecording(): Promise<void> {
    if (this.voiceState() === 'RECORDING') {
      this.stopVoiceRecording();
      return;
    }

    if (this.voiceState() === 'TRANSCRIBING') {
      return;
    }

    await this.startVoiceRecording();
  }

  private async startVoiceRecording(): Promise<void> {
    this.voiceError.set(null);

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      this.voiceState.set('ERROR');
      this.voiceError.set(
        'Este navegador no permite grabar audio para el dictado.'
      );
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

      const mimeType =
        this.preferredVoiceMimeType();

      const recorder =
        mimeType
          ? new MediaRecorder(
              stream,
              {
                mimeType
              }
            )
          : new MediaRecorder(stream);

      this.voiceStream = stream;
      this.voiceRecorder = recorder;
      this.voiceChunks = [];
      this.voiceSeconds.set(0);

      recorder.ondataavailable =
        (event: BlobEvent) => {
          if (event.data.size > 0) {
            this.voiceChunks.push(
              event.data
            );
          }
        };

      recorder.onerror =
        () => {
          this.voiceState.set('ERROR');
          this.voiceError.set(
            'La grabación se interrumpió. Puedes conservar y editar tu consulta escrita.'
          );
          this.cleanupVoiceCapture();
        };

      recorder.onstop =
        () => {
          this.finishVoiceRecording();
        };

      recorder.start();
      this.voiceState.set('RECORDING');
      this.startLiveVoicePreview();

      this.voiceTimer =
        setInterval(
          () => {
            const seconds =
              this.voiceSeconds() + 1;

            this.voiceSeconds.set(
              seconds
            );

            if (seconds >= 60) {
              this.stopVoiceRecording();
            }
          },
          1000
        );
    }
    catch (error) {
      this.cleanupVoiceCapture();
      this.voiceState.set('ERROR');

      if (
        error instanceof DOMException &&
        (
          error.name === 'NotAllowedError' ||
          error.name === 'SecurityError'
        )
      ) {
        this.voiceError.set(
          'Permiso de micrófono denegado. Habilítalo en el navegador y vuelve a intentar.'
        );
        return;
      }

      if (
        error instanceof DOMException &&
        error.name === 'NotFoundError'
      ) {
        this.voiceError.set(
          'No se encontró un micrófono disponible.'
        );
        return;
      }

      this.voiceError.set(
        'No fue posible iniciar el micrófono.'
      );
    }
  }

  private stopVoiceRecording(): void {
    const recorder =
      this.voiceRecorder;

    if (
      !recorder ||
      recorder.state === 'inactive'
    ) {
      return;
    }

    this.stopLiveVoicePreview();
    recorder.stop();
  }

  private startLiveVoicePreview(): void {
    const browserWindow =
      window as unknown as
        VoiceRecognitionWindow;

    const Recognition =
      browserWindow.SpeechRecognition ??
      browserWindow.webkitSpeechRecognition;

    if (!Recognition) {
      this.voiceLivePreview.set(false);
      return;
    }

    try {
      const recognition =
        new Recognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-BO';

      recognition.onresult =
        (event) => {
          const parts: string[] = [];

          for (
            let index = 0;
            index < event.results.length;
            index += 1
          ) {
            const result =
              event.results[index];

            if (
              !result ||
              result.length === 0
            ) {
              continue;
            }

            const transcript =
              result[0]?.transcript
                ?.trim();

            if (transcript) {
              parts.push(transcript);
            }
          }

          const preview =
            parts
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();

          if (preview) {
            this.question.setValue(
              preview
            );
          }
        };

      recognition.onerror =
        () => {
          this.voiceLivePreview.set(false);
        };

      recognition.onend =
        () => {
          if (
            this.voiceState() !== 'RECORDING' ||
            this.voiceRecognition !== recognition
          ) {
            this.voiceLivePreview.set(false);
            return;
          }

          try {
            recognition.start();
            this.voiceLivePreview.set(true);
          }
          catch {
            this.voiceLivePreview.set(false);
          }
        };

      recognition.start();

      this.voiceRecognition =
        recognition;

      this.voiceLivePreview.set(true);
    }
    catch {
      this.voiceRecognition = null;
      this.voiceLivePreview.set(false);
    }
  }

  private stopLiveVoicePreview(): void {
    const recognition =
      this.voiceRecognition;

    this.voiceRecognition = null;
    this.voiceLivePreview.set(false);

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    }
    catch {
      try {
        recognition.abort();
      }
      catch {
        // El dictado final de OpenAI sigue disponible.
      }
    }
  }

  private finishVoiceRecording(): void {
    const recorder =
      this.voiceRecorder;

    const mimeType =
      recorder?.mimeType ||
      this.voiceChunks[0]?.type ||
      'audio/webm';

    const chunks =
      [...this.voiceChunks];

    this.cleanupVoiceCapture();

    if (chunks.length === 0) {
      this.voiceState.set('ERROR');
      this.voiceError.set(
        'No se detectó audio. Intenta hablar un poco más cerca del micrófono.'
      );
      return;
    }

    const audio =
      new Blob(
        chunks,
        {
          type: mimeType
        }
      );

    if (audio.size === 0) {
      this.voiceState.set('ERROR');
      this.voiceError.set(
        'La grabación quedó vacía. Intenta nuevamente.'
      );
      return;
    }

    this.voiceState.set('TRANSCRIBING');
    this.voiceError.set(null);

    this.reports
      .transcribeVoice(audio)
      .subscribe({
        next: (response) => {
          this.question.setValue(
            response.text
          );
          this.question.markAsDirty();
          this.question.markAsTouched();
          this.voiceState.set('IDLE');

          this.feedback.success(
            'Dictado listo',
            'Revisa o edita la transcripción y luego genera el reporte.'
          );
        },
        error: (error: HttpErrorResponse) => {
          this.voiceState.set('ERROR');
          this.voiceError.set(
            this.readError(
              error,
              'No fue posible transcribir la consulta por voz.'
            )
          );
        }
      });
  }

  private preferredVoiceMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4'
    ];

    return (
      candidates.find(
        (candidate) =>
          MediaRecorder.isTypeSupported(
            candidate
          )
      ) ??
      ''
    );
  }

  private cleanupVoiceCapture(): void {
    this.stopLiveVoicePreview();

    if (this.voiceTimer !== null) {
      clearInterval(
        this.voiceTimer
      );
      this.voiceTimer = null;
    }

    if (this.voiceStream) {
      for (
        const track of
        this.voiceStream.getTracks()
      ) {
        track.stop();
      }
    }

    this.voiceStream = null;
    this.voiceRecorder = null;
    this.voiceChunks = [];
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
      this.aiLoading() ||
      this.voiceBusy()
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
