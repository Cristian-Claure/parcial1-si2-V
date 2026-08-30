import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { UserProfile } from '../../core/auth/auth.models';
import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

@Component({
  selector: 'app-manager',
  standalone: true,
  imports: [AuthenticatedShell],
  templateUrl: './manager.html',
  styleUrl: './manager.scss'
})
export class Manager {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly context = signal<UserProfile | null>(null);

  readonly navItems: ShellNavItem[] = [
    { label: 'Dashboard', route: '/sucursal' },
    { label: 'Catálogo', route: '/sucursal/catalogo' },
    { label: 'Inventario', route: '/sucursal/inventario' },
    { label: 'Pedidos y ventas', disabled: true },
    { label: 'POS y caja', disabled: true },
    { label: 'Reportes', disabled: true }
  ];

  constructor() {
    this.http.get<UserProfile>(
      '/api/manager/context'
    ).subscribe({
      next: (context) =>
        this.context.set(context)
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  userLabel(): string {
    const user = this.context();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Encargado';
  }
}