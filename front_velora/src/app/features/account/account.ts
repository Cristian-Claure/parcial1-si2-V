import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Product } from '../../core/catalog/catalog.models';
import { CatalogService } from '../../core/catalog/catalog.service';
import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [AuthenticatedShell],
  templateUrl: './account.html',
  styleUrl: './account.scss'
})
export class Account {
  readonly auth = inject(AuthService);

  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);

  readonly navItems: ShellNavItem[] = [
    { label: 'Inicio', route: '/' },
    { label: 'Explorar productos', route: '/catalogo' },
    { label: 'Mi cuenta', route: '/mi-cuenta' },
    { label: 'Bolsa', disabled: true },
    { label: 'Mis pedidos', disabled: true },
    { label: 'Favoritos', disabled: true },
    { label: 'Probador virtual', disabled: true }
  ];

  constructor() {
    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
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
      : 'Cliente';
  }

  lowestPrice(product: Product): number | null {
    const prices = product.variants
      .filter((variant) => variant.active)
      .map((variant) => variant.price);

    return prices.length ? Math.min(...prices) : null;
  }
}