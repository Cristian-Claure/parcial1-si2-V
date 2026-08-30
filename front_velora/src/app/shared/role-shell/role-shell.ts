import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import {
  AuthenticatedShell,
  ShellNavItem
} from '../authenticated-shell/authenticated-shell';

@Component({
  selector: 'app-role-shell',
  standalone: true,
  imports: [AuthenticatedShell],
  templateUrl: './role-shell.html'
})
export class RoleShell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly navItems = computed<ShellNavItem[]>(() => {
    const role = this.auth.currentUser()?.role;

    if (role === 'ADMIN') {
      return [
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
    }

    if (role === 'STORE_MANAGER') {
      return [
        { label: 'Dashboard', route: '/sucursal' },
        { label: 'Catálogo', route: '/sucursal/catalogo' },
        { label: 'Inventario', route: '/sucursal/inventario' },
        { label: 'Pedidos y ventas', disabled: true },
        { label: 'POS y caja', disabled: true },
        { label: 'Reportes', disabled: true }
      ];
    }

    return [];
  });

  readonly title = computed(() => {
    const user = this.auth.currentUser();

    if (user?.role === 'ADMIN') {
      return 'Administración central';
    }

    if (user?.role === 'STORE_MANAGER') {
      return user.storeName || 'Sucursal asignada';
    }

    return 'VÉLORA';
  });

  readonly subtitle = computed(() => {
    const role = this.auth.currentUser()?.role;

    if (role === 'ADMIN') {
      return 'Backoffice VÉLORA';
    }

    if (role === 'STORE_MANAGER') {
      return 'Operación de sucursal';
    }

    return '';
  });

  readonly userLabel = computed(() => {
    const user = this.auth.currentUser();

    if (!user) {
      return '';
    }

    return `${user.firstName} ${user.lastName}`;
  });

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }
}