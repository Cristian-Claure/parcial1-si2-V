import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  forkJoin
} from 'rxjs';

import {
  AuthService
} from '../../core/auth/auth.service';

import {
  Product
} from '../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../core/catalog/catalog.service';

import {
  FavoritesService
} from '../../core/favorites/favorites.service';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

import {
  CUSTOMER_NAV_ITEMS
} from '../../shared/customer-navigation';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [
    AuthenticatedShell,
    RouterLink
  ],
  templateUrl: './favorites.html',
  styleUrl: './favorites.scss'
})
export class FavoritesPage {
  readonly auth =
    inject(AuthService);

  readonly favorites =
    inject(FavoritesService);

  private readonly catalog =
    inject(CatalogService);

  private readonly router =
    inject(Router);

  readonly products =
    signal<Product[]>([]);

  readonly loading =
    signal(true);

  readonly busyProductId =
    signal<string | null>(null);

  readonly errorMessage =
    signal<string | null>(null);

  readonly navItems:
    ShellNavItem[] =
      CUSTOMER_NAV_ITEMS;

  readonly favoriteProducts =
    computed(
      () => {
        const ids =
          this.favorites.productIds();

        return this.products()
          .filter(
            (product) =>
              product.status ===
                'ACTIVE' &&
              ids.has(product.id)
          );
      }
    );

  readonly userLabel =
    computed(
      () => {
        const user =
          this.auth.currentUser();

        if (!user) {
          return '';
        }

        return (
          `${user.firstName} ` +
          `${user.lastName}`
        );
      }
    );

  constructor() {
    this.load();
  }

  remove(
    product: Product
  ): void {
    if (this.busyProductId()) {
      return;
    }

    this.errorMessage.set(null);
    this.busyProductId.set(
      product.id
    );

    this.favorites
      .remove(product.id)
      .subscribe({
        next: () => {
          this.busyProductId.set(
            null
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busyProductId.set(
            null
          );

          this.errorMessage.set(
            this.readError(
              error,
              'No fue posible retirar el favorito.'
            )
          );
        }
      });
  }

  primaryImage(
    product: Product
  ): string | null {
    const images =
      [...product.images].sort(
        (left, right) => {
          if (
            left.primary !==
            right.primary
          ) {
            return left.primary
              ? -1
              : 1;
          }

          return (
            left.sortOrder -
            right.sortOrder
          );
        }
      );

    return (
      images[0]?.imageUrl ??
      null
    );
  }

  lowestPrice(
    product: Product
  ): number | null {
    const prices =
      product.variants
        .filter(
          (variant) =>
            variant.active
        )
        .map(
          (variant) =>
            variant.price
        );

    if (!prices.length) {
      return null;
    }

    return Math.min(...prices);
  }

  logout(): void {
    this.auth.logout();

    void this.router.navigate(
      ['/']
    );
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      favorites:
        this.favorites.load(),
      products:
        this.catalog.publicProducts()
    }).subscribe({
      next: ({
        products
      }) => {
        this.products.set(
          products
        );

        this.loading.set(false);
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar sus favoritos.'
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