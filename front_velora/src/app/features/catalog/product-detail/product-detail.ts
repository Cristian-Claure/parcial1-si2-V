import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  inject,
  signal
} from '@angular/core';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import {
  AuthService
} from '../../../core/auth/auth.service';

import {
  CartService
} from '../../../core/cart/cart.service';

import {
  Product,
  ProductImage,
  ProductVariant
} from '../../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../../core/catalog/catalog.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss'
})
export class ProductDetail {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  private readonly catalog =
    inject(CatalogService);

  private readonly route =
    inject(ActivatedRoute);

  private readonly router =
    inject(Router);

  readonly product =
    signal<Product | null>(null);

  readonly loading =
    signal(true);

  readonly error =
    signal('');

  readonly message =
    signal('');

  readonly selectedVariantId =
    signal('');

  readonly selectedImageUrl =
    signal('');

  readonly adding =
    signal(false);

  constructor() {
    const slug =
      this.route.snapshot.paramMap.get(
        'slug'
      ) ?? '';

    if (!slug) {
      this.error.set(
        'No se encontró el producto solicitado.'
      );

      this.loading.set(false);
      return;
    }

    this.catalog.publicProducts().subscribe({
      next: (products) => {
        const product =
          products.find(
            (item) =>
              item.slug === slug &&
              item.status === 'ACTIVE'
          ) ?? null;

        if (!product) {
          this.error.set(
            'Este producto no está disponible.'
          );

          this.loading.set(false);
          return;
        }

        this.product.set(product);

        const firstVariant =
          product.variants.find(
            (variant) =>
              variant.active
          );

        if (firstVariant) {
          this.selectedVariantId.set(
            firstVariant.id
          );
        }

        const firstImage =
          this.images(product)[0];

        if (firstImage) {
          this.selectedImageUrl.set(
            firstImage.imageUrl
          );
        }

        this.loading.set(false);
      },

      error: () => {
        this.error.set(
          'No se pudo cargar el producto.'
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

  images(
    product: Product
  ): ProductImage[] {
    return [...product.images].sort(
      (left, right) => {
        if (
          left.primary !== right.primary
        ) {
          return left.primary ? -1 : 1;
        }

        return (
          left.sortOrder -
          right.sortOrder
        );
      }
    );
  }

  activeVariants(
    product: Product
  ): ProductVariant[] {
    return product.variants.filter(
      (variant) =>
        variant.active
    );
  }

  selectedVariant(
    product: Product
  ): ProductVariant | null {
    return product.variants.find(
      (variant) =>
        variant.id ===
        this.selectedVariantId()
    ) ?? null;
  }

  colorOptions(
    product: Product
  ): ProductVariant[] {
    const active =
      this.activeVariants(product);

    return active.filter(
      (variant, index) =>
        active.findIndex(
          (candidate) =>
            candidate.color ===
            variant.color
        ) === index
    );
  }

  sizeOptions(
    product: Product
  ): ProductVariant[] {
    const color =
      this.selectedVariant(product)
        ?.color;

    if (!color) {
      return [];
    }

    return this
      .activeVariants(product)
      .filter(
        (variant) =>
          variant.color === color
      );
  }

  selectColor(
    product: Product,
    color: string
  ): void {
    const current =
      this.selectedVariant(product);

    const candidates =
      this.activeVariants(product)
        .filter(
          (variant) =>
            variant.color === color
        );

    const next =
      candidates.find(
        (variant) =>
          variant.size ===
          current?.size
      ) ??
      candidates[0];

    if (next) {
      this.selectVariant(
        next.id
      );
    }
  }

  selectVariant(
    variantId: string
  ): void {
    this.selectedVariantId.set(
      variantId
    );

    this.message.set('');
    this.error.set('');
  }

  selectImage(
    imageUrl: string
  ): void {
    this.selectedImageUrl.set(
      imageUrl
    );
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
        'Seleccione color y talla antes de continuar.'
      );

      return;
    }

    this.adding.set(true);

    this.cart.addItem({
      variantId: variant.id,
      quantity: 1
    }).subscribe({
      next: () => {
        this.adding.set(false);

        this.message.set(
          `${product.name} · ${variant.color} · ${variant.size} se agregó a su bolsa.`
        );
      },

      error: (
        error: HttpErrorResponse
      ) => {
        this.adding.set(false);

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