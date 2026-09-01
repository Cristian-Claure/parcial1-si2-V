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

type CatalogSortOrder =
  | 'FEATURED'
  | 'PRICE_ASC'
  | 'PRICE_DESC'
  | 'NAME_ASC';

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

  readonly searchTerm =
    signal('');

  readonly selectedCategory =
    signal('ALL');

  readonly sortOrder =
    signal<CatalogSortOrder>(
      'FEATURED'
    );

  readonly categories =
    computed(() => {
      const values =
        this.products()
          .map(
            (product) =>
              product.categoryName
                ?.trim() ?? ''
          )
          .filter(
            (value) =>
              value.length > 0
          );

      return Array
        .from(
          new Set(values)
        )
        .sort(
          (left, right) =>
            left.localeCompare(
              right,
              'es'
            )
        );
    });

  readonly hasActiveFilters =
    computed(
      () =>
        this.searchTerm().trim().length >
          0 ||
        this.selectedCategory() !==
          'ALL' ||
        this.sortOrder() !==
          'FEATURED'
    );

  readonly visibleProducts =
    computed(() => {
      const term =
        this.normalizeSearch(
          this.searchTerm()
        );

      const category =
        this.selectedCategory();

      const filtered =
        this.products().filter(
          (product) => {
            if (
              category !== 'ALL' &&
              product.categoryName !==
                category
            ) {
              return false;
            }

            if (!term) {
              return true;
            }

            const variants =
              product.variants.flatMap(
                (variant) => [
                  variant.color,
                  variant.size
                ]
              );

            const searchable =
              [
                product.name,
                product.brand ?? '',
                product.description ?? '',
                product.categoryName ?? '',
                ...variants
              ].join(' ');

            return this
              .normalizeSearch(
                searchable
              )
              .includes(term);
          }
        );

      switch (this.sortOrder()) {
        case 'PRICE_ASC':
          return [...filtered].sort(
            (left, right) =>
              (
                this.lowestPrice(left) ??
                Number.MAX_SAFE_INTEGER
              ) -
              (
                this.lowestPrice(right) ??
                Number.MAX_SAFE_INTEGER
              )
          );

        case 'PRICE_DESC':
          return [...filtered].sort(
            (left, right) =>
              (
                this.lowestPrice(right) ??
                -1
              ) -
              (
                this.lowestPrice(left) ??
                -1
              )
          );

        case 'NAME_ASC':
          return [...filtered].sort(
            (left, right) =>
              left.name.localeCompare(
                right.name,
                'es'
              )
          );

        default:
          return filtered;
      }
    });

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

  updateSearch(
    value: string
  ): void {
    this.searchTerm.set(value);
  }

  updateCategory(
    value: string
  ): void {
    this.selectedCategory.set(
      value
    );
  }

  updateSort(
    value: string
  ): void {
    switch (value) {
      case 'PRICE_ASC':
      case 'PRICE_DESC':
      case 'NAME_ASC':
        this.sortOrder.set(value);
        break;

      default:
        this.sortOrder.set(
          'FEATURED'
        );
    }
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set(
      'ALL'
    );
    this.sortOrder.set(
      'FEATURED'
    );
  }

  private normalizeSearch(
    value: string
  ): string {
    return value
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      );
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