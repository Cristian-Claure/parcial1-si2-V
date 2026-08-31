import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import {
  AuthService
} from '../../../core/auth/auth.service';

import {
  UserProfile
} from '../../../core/auth/auth.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './login.html',
  styleUrl: '../shared/auth-page.scss'
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],
    password: [
      '',
      Validators.required
    ]
  });

  constructor() {
    const registered =
      this.route.snapshot.queryParamMap
        .get('registered');

    const email =
      this.route.snapshot.queryParamMap
        .get('email');

    if (registered === '1') {
      this.successMessage.set(
        'Cuenta creada correctamente. Inicie sesión para continuar.'
      );
    }

    if (email) {
      this.form.controls.email.setValue(
        email
      );
    }
  }

  submit(): void {
    this.errorMessage.set('');

    if (
      this.form.invalid ||
      this.loading()
    ) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    this.auth.login(
      this.form.getRawValue()
    ).subscribe({
      next: (response) => {
        this.loading.set(false);

        this.navigateByRole(
          response.user
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        if (
          error.status === 401 ||
          error.status === 403
        ) {
          this.errorMessage.set(
            'Correo o contraseña incorrectos.'
          );

          return;
        }

        this.errorMessage.set(
          error.error?.message ??
            'No fue posible iniciar sesión.'
        );
      }
    });
  }

  private navigateByRole(
    user: UserProfile
  ): void {
    if (user.role === 'ADMIN') {
      void this.router.navigate(
        ['/admin']
      );
      return;
    }

    if (
      user.role === 'STORE_MANAGER'
    ) {
      void this.router.navigate(
        ['/sucursal']
      );
      return;
    }

    void this.router.navigate(
      ['/mi-cuenta']
    );
  }
}