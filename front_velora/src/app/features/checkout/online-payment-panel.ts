import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import * as QRCode from 'qrcode';

import {
  Order
} from '../../core/order/order.models';

import {
  OnlinePaymentIntent,
  Payment
} from '../../core/payment/payment.models';

import {
  PaymentService
} from '../../core/payment/payment.service';

type OnlineMethod =
  | 'CARD'
  | 'QR';

@Component({
  selector: 'app-online-payment-panel',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl:
    './online-payment-panel.html',
  styleUrl:
    './online-payment-panel.scss'
})
export class OnlinePaymentPanel {
  @Input({
    required: true
  })
  order!: Order;

  @Output()
  readonly paymentCompleted =
    new EventEmitter<Payment>();

  private readonly payments =
    inject(PaymentService);

  private readonly fb =
    inject(FormBuilder);

  readonly method =
    signal<OnlineMethod>('CARD');

  readonly busy =
    signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly successMessage =
    signal<string | null>(null);

  readonly intent =
    signal<OnlinePaymentIntent | null>(
      null
    );

  readonly paidPayment =
    signal<Payment | null>(
      null
    );

  readonly qrDataUrl =
    signal<string | null>(null);

  readonly cardForm =
    this.fb.nonNullable.group({
      holder: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100)
        ]
      ],

      number: [
        '',
        Validators.required
      ],

      expiry: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^(0[1-9]|1[0-2])\/\d{2}$/
          )
        ]
      ],

      cvv: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^\d{3,4}$/
          )
        ]
      ]
    });

  selectMethod(
    method: OnlineMethod
  ): void {
    if (
      this.busy() ||
      this.hasPendingIntent()
    ) {
      this.errorMessage.set(
        'Cancele o complete el intento de pago actual antes de cambiar de método.'
      );

      return;
    }

    this.method.set(method);
    this.clearMessages();
  }

  hasPendingIntent(): boolean {
    return (
      this.intent()?.payment.status ===
        'PENDING'
    );
  }

  payCard(): void {
    this.clearMessages();

    if (
      this.busy() ||
      this.hasPendingIntent()
    ) {
      return;
    }

    if (this.cardForm.invalid) {
      this.cardForm.markAllAsTouched();

      this.errorMessage.set(
        'Revise los datos de la tarjeta.'
      );

      return;
    }

    const raw =
      this.cardForm.getRawValue();

    const cardNumber =
      this.normalizeCardNumber(
        raw.number
      );

    if (
      cardNumber.length < 13 ||
      cardNumber.length > 19 ||
      !this.luhnValid(cardNumber)
    ) {
      this.errorMessage.set(
        'El número de tarjeta no es válido.'
      );

      return;
    }

    if (
      !this.expiryValid(
        raw.expiry
      )
    ) {
      this.errorMessage.set(
        'La fecha de vencimiento no es válida o ya expiró.'
      );

      return;
    }

    const brand =
      this.detectBrand(
        cardNumber
      );

    const last4 =
      cardNumber.slice(-4);

    /*
     * Sandbox:
     * el PAN y CVV permanecen únicamente
     * en la memoria del navegador.
     *
     * El backend recibe un token efímero,
     * marca y últimos cuatro dígitos.
     */
    const token =
      `vlr_sbx_${crypto
        .randomUUID()
        .replaceAll('-', '')}`;

    this.busy.set(true);

    this.payments
      .createOnlineIntent(
        this.order.id,
        {
          method: 'CARD',

          cardToken:
            token,

          cardBrand:
            brand,

          cardLast4:
            last4,

          notes:
            `Tarjeta ${brand} terminada en ${last4}.`
        }
      )
      .subscribe({
        next: (intent) => {
          this.intent.set(intent);

          /*
           * Eliminamos de memoria visual
           * los datos sensibles apenas se
           * obtiene la intención.
           */
          this.cardForm.reset({
            holder: '',
            number: '',
            expiry: '',
            cvv: ''
          });

          this.confirmIntent(
            intent.payment.id
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busy.set(false);

          this.errorMessage.set(
            this.readError(
              error,
              'No fue posible iniciar el pago con tarjeta.'
            )
          );
        }
      });
  }

  generateQr(): void {
    this.clearMessages();

    if (
      this.busy() ||
      this.hasPendingIntent()
    ) {
      return;
    }

    this.busy.set(true);

    this.payments
      .createOnlineIntent(
        this.order.id,
        {
          method: 'QR',
          cardToken: null,
          cardBrand: null,
          cardLast4: null,
          notes:
            'Pago QR online.'
        }
      )
      .subscribe({
        next: (intent) => {
          this.intent.set(intent);

          if (!intent.qrPayload) {
            this.busy.set(false);

            this.errorMessage.set(
              'El gateway no devolvió información para generar el QR.'
            );

            return;
          }

          void this.renderQr(
            intent.qrPayload
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busy.set(false);

          this.errorMessage.set(
            this.readError(
              error,
              'No fue posible generar el pago QR.'
            )
          );
        }
      });
  }

  confirmQrPayment(): void {
    const current =
      this.intent();

    if (
      !current ||
      current.payment.method !==
        'QR' ||
      current.payment.status !==
        'PENDING' ||
      this.busy()
    ) {
      return;
    }

    if (this.qrExpired()) {
      this.errorMessage.set(
        'El código QR expiró. Cancele este intento y genere uno nuevo.'
      );

      return;
    }

    this.clearMessages();
    this.busy.set(true);

    this.confirmIntent(
      current.payment.id
    );
  }

  cancelCurrentIntent(): void {
    const current =
      this.intent();

    if (
      !current ||
      current.payment.status !==
        'PENDING' ||
      this.busy()
    ) {
      return;
    }

    this.clearMessages();
    this.busy.set(true);

    this.payments.cancel(
      current.payment.id,
      'Intento de pago cancelado por el cliente.'
    ).subscribe({
      next: () => {
        this.busy.set(false);

        this.intent.set(null);
        this.qrDataUrl.set(null);

        this.successMessage.set(
          'El intento de pago fue cancelado. Puede seleccionar otro método.'
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.busy.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cancelar el intento de pago.'
          )
        );
      }
    });
  }

  qrExpired(): boolean {
    const expiresAt =
      this.intent()?.expiresAt;

    if (!expiresAt) {
      return false;
    }

    return (
      new Date(expiresAt)
        .getTime() <=
      Date.now()
    );
  }

  qrExpirationLabel(): string {
    const expiresAt =
      this.intent()?.expiresAt;

    if (!expiresAt) {
      return '';
    }

    return new Intl.DateTimeFormat(
      'es-BO',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(
      new Date(expiresAt)
    );
  }

  private confirmIntent(
    paymentId: string
  ): void {
    this.payments
      .confirmOnlineSandbox(
        paymentId
      )
      .subscribe({
        next: (payment) => {
          this.busy.set(false);

          this.paidPayment.set(
            payment
          );

          this.intent.update(
            (current) =>
              current
                ? {
                    ...current,
                    payment
                  }
                : null
          );

          this.successMessage.set(
            `Pago ${payment.method} confirmado por Bs ${payment.amount}.`
          );

          this.paymentCompleted.emit(
            payment
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busy.set(false);

          this.errorMessage.set(
            this.readError(
              error,
              'El pago fue iniciado, pero todavía no pudo confirmarse.'
            )
          );
        }
      });
  }

  private async renderQr(
    payload: string
  ): Promise<void> {
    try {
      const dataUrl =
        await QRCode.toDataURL(
          payload,
          {
            width: 280,
            margin: 2,
            errorCorrectionLevel:
              'M'
          }
        );

      this.qrDataUrl.set(
        dataUrl
      );

      this.busy.set(false);

      this.successMessage.set(
        'QR generado correctamente. Escanee el código y confirme el pago.'
      );
    }
    catch {
      this.busy.set(false);

      this.errorMessage.set(
        'No fue posible renderizar el código QR.'
      );
    }
  }

  private normalizeCardNumber(
    value: string
  ): string {
    return value.replace(
      /\D/g,
      ''
    );
  }

  private detectBrand(
    cardNumber: string
  ): string {
    if (
      cardNumber.startsWith(
        '4'
      )
    ) {
      return 'VISA';
    }

    const prefix =
      Number(
        cardNumber.slice(0, 2)
      );

    if (
      prefix >= 51 &&
      prefix <= 55
    ) {
      return 'MASTERCARD';
    }

    return 'CARD';
  }

  private luhnValid(
    value: string
  ): boolean {
    let sum = 0;
    let doubleDigit = false;

    for (
      let i = value.length - 1;
      i >= 0;
      i--
    ) {
      let digit =
        Number(value[i]);

      if (
        Number.isNaN(digit)
      ) {
        return false;
      }

      if (doubleDigit) {
        digit *= 2;

        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;

      doubleDigit =
        !doubleDigit;
    }

    return (
      sum % 10 === 0
    );
  }

  private expiryValid(
    value: string
  ): boolean {
    const match =
      /^(0[1-9]|1[0-2])\/(\d{2})$/
        .exec(value);

    if (!match) {
      return false;
    }

    const month =
      Number(match[1]);

    const year =
      2000 +
      Number(match[2]);

    const now =
      new Date();

    const expiry =
      new Date(
        year,
        month,
        0,
        23,
        59,
        59
      );

    return (
      expiry.getTime() >=
      now.getTime()
    );
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const message =
      error.error?.message;

    return (
      typeof message ===
        'string' &&
      message.trim().length
    )
      ? message
      : fallback;
  }
}