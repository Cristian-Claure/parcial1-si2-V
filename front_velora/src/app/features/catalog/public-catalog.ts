import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  AuthService
} from '../../core/auth/auth.service';

import {
  CartService
} from '../../core/cart/cart.service';

import {
  Product,
  ProductVariant
} from '../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../core/catalog/catalog.service';

@Component({
  selector: 'app-public-catalog',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './public-catalog.html',
  styleUrl: './public-catalog.scss'
})
export class PublicCatalog {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  private readonly catalog =
    inject(CatalogService);

  private readonly router =
    inject(Router);

  readonly products =
    signal<Product[]>([]);

  readonly loading =
    signal(true);

  readonly error =
    signal('');

  readonly message =
    signal('');

  readonly selectedVariants =
    signal<Record<string, string>>({});

  readonly addingProductId =
    signal<string | null>(null);

  constructor() {
    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);

        const initial:
          Record<string, string> = {};

        for (const product of products) {
          const first =
            product.variants.find(
              (variant) => variant.active
            );

          if (first) {
            initial[product.id] =
              first.id;
          }
        }

        this.selectedVariants.set(
          initial
        );

        this.loading.set(false);
      },

      error: () => {
        this.error.set(
          'No se pudo cargar el catálogo.'
        );

        this.loading.set(false);
      }
    });

    if (
      this.auth.currentUser()?.role ===
      'CUSTOMER'
    ) {
      this.cart.load().subscribe({
        error: () => undefined
      });
    }
  }

  lowestPrice(
    product: Product
  ): number | null {
    const prices =
      product.variants
        .filter(
          (variant) => variant.active
        )
        .map(
          (variant) => variant.price
        );

    return prices.length
      ? Math.min(...prices)
      : null;
  }

  activeVariants(
    product: Product
  ): ProductVariant[] {
    return product.variants.filter(
      (variant) => variant.active
    );
  }

  selectedVariantId(
    productId: string
  ): string {
    return this.selectedVariants()[
      productId
    ] ?? '';
  }

  selectedVariant(
    product: Product
  ): ProductVariant | null {
    const id =
      this.selectedVariantId(
        product.id
      );

    return product.variants.find(
      (variant) =>
        variant.id === id
    ) ?? null;
  }

  selectVariant(
    productId: string,
    variantId: string
  ): void {
    this.selectedVariants.update(
      (current) => ({
        ...current,
        [productId]: variantId
      })
    );

    this.message.set('');
    this.error.set('');
  }

  addToCart(
    product: Product
  ): void {
    this.message.set('');
    this.error.set('');

    const user =
      this.auth.currentUser();

    if (!user) {
      void this.router.navigate(
        ['/login']
      );

      return;
    }

    if (user.role !== 'CUSTOMER') {
      this.error.set(
        'La bolsa está disponible únicamente para clientes.'
      );

      return;
    }

    const variant =
      this.selectedVariant(product);

    if (!variant) {
      this.error.set(
        'Seleccione una variante antes de continuar.'
      );

      return;
    }

    this.addingProductId.set(
      product.id
    );

    this.cart.addItem({
      variantId: variant.id,
      quantity: 1
    }).subscribe({
      next: () => {
        this.addingProductId.set(null);

        this.message.set(
          `${product.name} · ${variant.color} · ${variant.size} se agregó a su bolsa.`
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.addingProductId.set(null);

        const backendMessage =
          error.error?.message;

        this.error.set(
          typeof backendMessage ===
            'string'
            ? backendMessage
            : 'No fue posible agregar el producto a la bolsa.'
        );
      }
    });
  }
}