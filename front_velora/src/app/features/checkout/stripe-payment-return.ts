import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import {
  Subscription,
  interval,
  startWith,
  switchMap,
  takeWhile
} from 'rxjs';

import {
  Payment
} from '../../core/payment/payment.models';

import {
  PaymentService
} from '../../core/payment/payment.service';

@Component({
  selector: 'app-stripe-payment-return',
  standalone: true,
  imports: [RouterLink],
  templateUrl:
    './stripe-payment-return.html',
  styleUrl:
    './stripe-payment-return.scss'
})
export class StripePaymentReturn
  implements OnInit, OnDestroy {

  private readonly route =
    inject(ActivatedRoute);

  private readonly payments =
    inject(PaymentService);

  private readonly router =
    inject(Router);

  private subscription:
    Subscription | null = null;

  readonly payment =
    signal<Payment | null>(null);

  readonly loading = signal(true);
  readonly errorMessage =
    signal<string | null>(null);

  ngOnInit(): void {
    const paymentId =
      this.route.snapshot
        .queryParamMap
        .get('payment_id');

    if (!paymentId) {
      this.loading.set(false);
      this.errorMessage.set(
        'No encontramos el identificador del pago.'
      );
      return;
    }

    let attempts = 0;

    this.subscription =
      interval(1000)
        .pipe(
          startWith(0),
          switchMap(() => {
            attempts += 1;
            return this.payments.get(
              paymentId
            );
          }),
          takeWhile(
            (payment) =>
              payment.status ===
                'PENDING' &&
              attempts < 20,
            true
          )
        )
        .subscribe({
          next: (payment) => {
            this.payment.set(payment);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set(
              'No pudimos comprobar el pago. Revíselo desde Mis pedidos.'
            );
          }
        });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  goToOrders(): void {
    void this.router.navigate([
      '/mis-pedidos'
    ]);
  }
}