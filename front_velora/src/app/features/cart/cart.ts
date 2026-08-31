import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  inject,
  signal
} from '@angular/core';

import { Router } from '@angular/router';

import {
  AuthService
} from '../../core/auth/auth.service';

import {
  CartItem
} from '../../core/cart/cart.models';

import {
  CartService
} from '../../core/cart/cart.service';

import {
  Product
} from '../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../core/catalog/catalog.service';

import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    AuthenticatedShell
  ],
  templateUrl: './cart.html',
  styleUrl: './cart.scss'
})
export class CartPage {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  private readonly catalog =
    inject(CatalogService);

  private readonly router =
    inject(Router);

  readonly products =
    signal<Product[]>([]);

  readonly loading = signal(true);

  readonly busyItemId =
    signal<string | null>(null);

  readonly clearing = signal(false);

  readonly errorMessage =
    signal<string | null>(null);

  readonly navItems: ShellNavItem[] = [
    {
      label: 'Inicio',
      route: '/'
    },
    {
      label: 'Explorar productos',
      route: '/catalogo'
    },
    {
      label: 'Mi cuenta',
      route: '/mi-cuenta'
    },
    {
      label: 'Bolsa',
      route: '/bolsa'
    },
    {
      label: 'Mis pedidos',
      route: '/mis-pedidos'
    },
    {
      label: 'Favoritos',
      disabled: true
    },
    {
      label: 'Probador virtual',
      disabled: true
    }
  ];

  constructor() {
    this.load();

    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);
      }
    });
  }

  userLabel(): string {
    const user =
      this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Cliente';
  }

  increase(item: CartItem): void {
    if (item.quantity >= 99) {
      return;
    }

    this.changeQuantity(
      item,
      item.quantity + 1
    );
  }

  decrease(item: CartItem): void {
    if (item.quantity <= 1) {
      return;
    }

    this.changeQuantity(
      item,
      item.quantity - 1
    );
  }

  remove(item: CartItem): void {
    this.errorMessage.set(null);
    this.busyItemId.set(item.id);

    this.cart.removeItem(
      item.id
    ).subscribe({
      next: () => {
        this.busyItemId.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.busyItemId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible retirar el producto.'
          )
        );
      }
    });
  }

  clear(): void {
    if (
      !window.confirm(
        '¿Vaciar todos los productos de la bolsa?'
      )
    ) {
      return;
    }

    this.errorMessage.set(null);
    this.clearing.set(true);

    this.cart.clear().subscribe({
      next: () => {
        this.clearing.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.clearing.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible vaciar la bolsa.'
          )
        );
      }
    });
  }

  continueShopping(): void {
    void this.router.navigate(
      ['/catalogo']
    );
  }

  checkout(): void {
    void this.router.navigate(
      ['/checkout']
    );
  }

  productImage(
    productId: string
  ): string | null {
    const product =
      this.products().find(
        (candidate) =>
          candidate.id === productId
      );

    if (
      !product ||
      !product.images.length
    ) {
      return null;
    }

    const primary =
      product.images.find(
        (image) => image.primary
      ) ?? product.images[0];

    return primary.imageUrl || null;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.cart.load().subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar la bolsa.'
          )
        );
      }
    });
  }

  private changeQuantity(
    item: CartItem,
    quantity: number
  ): void {
    this.errorMessage.set(null);
    this.busyItemId.set(item.id);

    this.cart.updateItem(
      item.id,
      { quantity }
    ).subscribe({
      next: () => {
        this.busyItemId.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.busyItemId.set(null);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible actualizar la cantidad.'
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

    return typeof message === 'string' &&
      message.trim().length
      ? message
      : fallback;
  }
}