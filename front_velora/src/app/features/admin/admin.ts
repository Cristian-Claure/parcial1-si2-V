import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { UserProfile } from '../../core/auth/auth.models';
import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

interface Store {
  id: string;
  code: string;
  name: string;
  address: string | null;
  active: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AuthenticatedShell
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class Admin {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly stores = signal<Store[]>([]);
  readonly managers = signal<UserProfile[]>([]);
  readonly message = signal('');
  readonly error = signal('');

  readonly navItems: ShellNavItem[] = [
    { label: 'Dashboard', route: '/admin' },
    { label: 'Sucursales', route: '/admin' },
    { label: 'Usuarios y encargados', route: '/admin' },
    { label: 'Catálogo', route: '/admin/catalogo' },
    { label: 'Inventario', route: '/admin/inventario' },
    { label: 'Pedidos y ventas', disabled: true },
    { label: 'POS y cajas', disabled: true },
    { label: 'Reportes IA', disabled: true },
    { label: 'Auditoría', disabled: true },
    { label: 'Configuración', disabled: true }
  ];

  readonly storeForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    address: ['']
  });

  readonly managerForm = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    storeId: ['', Validators.required]
  });

  constructor() {
    this.reload();
  }

  createStore(): void {
    if (this.storeForm.invalid) {
      this.storeForm.markAllAsTouched();
      return;
    }

    this.clearFeedback();

    this.http.post<Store>(
      '/api/admin/stores',
      this.storeForm.getRawValue()
    ).subscribe({
      next: () => {
        this.storeForm.reset({
          code: '',
          name: '',
          address: ''
        });

        this.message.set('Sucursal creada correctamente.');
        this.reload();
      },
      error: (error: HttpErrorResponse) =>
        this.handleError(error)
    });
  }

  createManager(): void {
    if (this.managerForm.invalid) {
      this.managerForm.markAllAsTouched();
      return;
    }

    this.clearFeedback();

    this.http.post<UserProfile>(
      '/api/admin/users/managers',
      this.managerForm.getRawValue()
    ).subscribe({
      next: () => {
        this.managerForm.reset({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          storeId: ''
        });

        this.message.set(
          'Encargado creado y asignado correctamente.'
        );

        this.reload();
      },
      error: (error: HttpErrorResponse) =>
        this.handleError(error)
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  userLabel(): string {
    const user = this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Administrador';
  }

  private reload(): void {
    this.http.get<Store[]>('/api/admin/stores').subscribe({
      next: (stores) => this.stores.set(stores)
    });

    this.http.get<UserProfile[]>(
      '/api/admin/users/managers'
    ).subscribe({
      next: (managers) => this.managers.set(managers)
    });
  }

  private clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }

  private handleError(error: HttpErrorResponse): void {
    this.error.set(
      error.error?.message ??
      'No se pudo completar la operación.'
    );
  }
}