import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  Input,
  inject,
  signal
} from '@angular/core';

import {
  Order
} from '../../core/order/order.models';

import {
  FeedbackService
} from '../../core/feedback/feedback.service';

import {
  PaymentService
} from '../../core/payment/payment.service';

@Component({
  selector: 'app-online-payment-panel',
  standalone: true,
  templateUrl:
    './online-payment-panel.html',
  styleUrl:
    './online-payment-panel.scss'
})
export class OnlinePaymentPanel {
  @Input({ required: true })
  order!: Order;

  private readonly payments =
    inject(PaymentService);

  private readonly feedback =
    inject(FeedbackService);

  readonly busy = signal(false);
  readonly errorMessage =
    signal<string | null>(null);

  startStripeCheckout(): void {
    if (this.busy()) {
      return;
    }

    this.errorMessage.set(null);
    this.busy.set(true);

    this.payments
      .createStripeCheckout(
        this.order.id
      )
      .subscribe({
        next: (checkout) => {
          this.feedback.info(
            'Pago seguro preparado',
            'Será redirigido a Stripe para completar el pago.'
          );

          globalThis.location.assign(
            checkout.checkoutUrl
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busy.set(false);

          this.errorMessage.set(
            this.readError(
              error,
              'No fue posible iniciar el pago seguro.'
            )
          );
        }
      });
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const message =
      error.error?.message ??
      error.error?.detail ??
      error.error?.error;

    return typeof message === 'string' &&
      message.trim()
        ? message
        : fallback;
  }
}