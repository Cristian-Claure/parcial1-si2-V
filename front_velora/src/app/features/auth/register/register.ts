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
  Router,
  RouterLink
} from '@angular/router';

import {
  AuthService
} from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './register.html',
  styleUrl: '../shared/auth-page.scss'
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    firstName: [
      '',
      [
        Validators.required,
        Validators.maxLength(80)
      ]
    ],
    lastName: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],
    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/
        )
      ]
    ],
    confirmPassword: [
      '',
      Validators.required
    ]
  });

  submit(): void {
    this.errorMessage.set('');

    if (
      this.form.invalid ||
      this.loading()
    ) {
      this.form.markAllAsTouched();

      this.errorMessage.set(
        'Revise los campos marcados antes de continuar.'
      );

      return;
    }

    const value =
      this.form.getRawValue();

    if (
      value.password !==
      value.confirmPassword
    ) {
      this.form.controls.confirmPassword
        .markAsTouched();

      this.errorMessage.set(
        'Las contraseñas no coinciden.'
      );

      return;
    }

    this.loading.set(true);

    this.auth.register({
      firstName:
        value.firstName.trim(),
      lastName:
        value.lastName.trim(),
      email:
        value.email.trim().toLowerCase(),
      password:
        value.password
    }).subscribe({
      next: () => {
        this.loading.set(false);

        /*
         * El registro público crea la cuenta,
         * pero el usuario debe autenticarse
         * nuevamente de forma explícita.
         */
        this.auth.logout();

        void this.router.navigate(
          ['/login'],
          {
            queryParams: {
              registered: '1',
              email:
                value.email
                  .trim()
                  .toLowerCase()
            }
          }
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        if (error.status === 409) {
          this.errorMessage.set(
            'Ya existe una cuenta registrada con este correo electrónico.'
          );

          return;
        }

        if (error.status === 400) {
          this.errorMessage.set(
            error.error?.message ??
              'Los datos enviados no son válidos. Revise el formulario.'
          );

          return;
        }

        this.errorMessage.set(
          error.error?.message ??
            'No fue posible crear la cuenta. Intente nuevamente.'
        );
      }
    });
  }

  passwordInvalid(): boolean {
    const control =
      this.form.controls.password;

    return (
      control.touched &&
      control.invalid
    );
  }

  passwordsMismatch(): boolean {
    const confirm =
      this.form.controls.confirmPassword;

    return (
      confirm.touched &&
      confirm.value.length > 0 &&
      this.form.controls.password.value !==
        confirm.value
    );
  }
}