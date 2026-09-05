import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  catchError,
  finalize,
  of,
  switchMap,
  takeWhile,
  timer
} from 'rxjs';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  Product,
  ProductVariant
} from '../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../core/catalog/catalog.service';

import {
  TryOnJob
} from '../../core/try-on/try-on.models';

import {
  TryOnService
} from '../../core/try-on/try-on.service';

const MAX_PERSON_BYTES =
  5 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    'image/png',
    'image/jpeg',
    'image/webp'
  ]);

@Component({
  selector: 'app-customer-try-on',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './customer-try-on.html',
  styleUrl: './customer-try-on.scss'
})
export class CustomerTryOnPage {
  private readonly catalog =
    inject(CatalogService);

  private readonly tryOn =
    inject(TryOnService);

  private readonly route =
    inject(ActivatedRoute);

  private readonly destroyRef =
    inject(DestroyRef);

  readonly loading =
    signal(true);

  readonly error =
    signal('');

  readonly products =
    signal<Product[]>([]);

  readonly selectedProductId =
    signal('');

  readonly selectedVariantId =
    signal('');

  readonly person =
    signal<File | null>(null);

  readonly personPreviewUrl =
    signal('');

  readonly job =
    signal<TryOnJob | null>(null);

  readonly resultUrl =
    signal('');

  readonly running =
    signal(false);

  readonly tryOnProducts =
    computed(() =>
      this.products().filter(
        (product) =>
          product.status === 'ACTIVE' &&
          product.tryOnEnabled &&
          product.tryOnReady
      )
    );

  readonly selectedProduct =
    computed(() =>
      this.tryOnProducts().find(
        (product) =>
          product.id ===
          this.selectedProductId()
      ) ?? null
    );

  readonly activeVariants =
    computed(() =>
      this.selectedProduct()
        ?.variants
        .filter(
          (variant) =>
            variant.active
        ) ?? []
    );

  readonly canSubmit =
    computed(() =>
      !this.running() &&
      !!this.selectedProduct() &&
      !!this.selectedVariantId() &&
      !!this.person()
    );

  readonly statusLabel =
    computed(() => {
      const status =
        this.job()?.status;

      switch (status) {
        case 'QUEUED':
          return 'Preparando experiencia...';
        case 'PROCESSING':
          return 'Creando su prueba virtual...';
        case 'SUCCEEDED':
          return 'Resultado listo';
        case 'FAILED':
          return 'No se pudo generar el resultado';
        case 'CANCELLED':
          return 'Generación cancelada';
        default:
          return '';
      }
    });

  constructor() {
    this.catalog
      .publicProducts()
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        )
      )
      .subscribe({
        next: (products) => {
          this.products.set(
            products
          );

          const requestedSlug =
            this.route
              .snapshot
              .queryParamMap
              .get('producto');

          const requested =
            requestedSlug
              ? products.find(
                  (product) =>
                    product.slug ===
                      requestedSlug &&
                    product.tryOnReady
                )
              : null;

          const initial =
            requested ??
            products.find(
              (product) =>
                product.status ===
                  'ACTIVE' &&
                product.tryOnReady
            ) ??
            null;

          if (initial) {
            this.selectProduct(
              initial.id
            );
          }

          this.loading.set(false);
        },
        error: () => {
          this.error.set(
            'No se pudo cargar el catálogo del probador.'
          );
          this.loading.set(false);
        }
      });
  }

  selectProduct(
    productId: string
  ): void {
    this.selectedProductId.set(
      productId
    );

    const product =
      this.products().find(
        (item) =>
          item.id === productId
      );

    const firstVariant =
      product?.variants.find(
        (variant) =>
          variant.active
      ) ?? null;

    this.selectedVariantId.set(
      firstVariant?.id ?? ''
    );

    this.clearResult();
    this.job.set(null);
    this.error.set('');
  }

  onProductChange(
    event: Event
  ): void {
    const value =
      (
        event.target as
          HTMLSelectElement
      ).value;

    this.selectProduct(
      value
    );
  }

  onVariantChange(
    event: Event
  ): void {
    const value =
      (
        event.target as
          HTMLSelectElement
      ).value;

    this.selectedVariantId.set(
      value
    );

    this.clearResult();
    this.job.set(null);
    this.error.set('');
  }

  onPersonSelected(
    event: Event
  ): void {
    const input =
      event.target as
        HTMLInputElement;

    const file =
      input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (
      !ALLOWED_TYPES.has(
        file.type
      )
    ) {
      this.error.set(
        'Use una foto PNG, JPEG o WEBP.'
      );
      input.value = '';
      return;
    }

    if (
      file.size <= 0 ||
      file.size >
        MAX_PERSON_BYTES
    ) {
      this.error.set(
        'La foto debe pesar como máximo 5 MB.'
      );
      input.value = '';
      return;
    }

    this.person.set(
      file
    );

    this.replacePersonPreview(
      URL.createObjectURL(file)
    );

    this.clearResult();
    this.job.set(null);
    this.error.set('');
  }

  generate(): void {
    const product =
      this.selectedProduct();

    const file =
      this.person();

    const variantId =
      this.selectedVariantId();

    if (
      !product ||
      !file ||
      !variantId ||
      this.running()
    ) {
      return;
    }

    if (!navigator.onLine) {
      this.error.set(
        'El probador virtual requiere conexión a internet.'
      );
      return;
    }

    this.clearResult();
    this.job.set(null);
    this.error.set('');
    this.running.set(true);

    this.tryOn
      .createJob({
        productId:
          product.id,
        variantId,
        person: file
      })
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        )
      )
      .subscribe({
        next: (created) => {
          this.job.set(
            created
          );
          this.poll(
            created.id
          );
        },
        error: (error) => {
          this.running.set(false);
          this.error.set(
            this.messageFromError(
              error,
              'No fue posible iniciar el probador virtual.'
            )
          );
        }
      });
  }

  cancel(): void {
    const current =
      this.job();

    if (
      !current ||
      !this.running()
    ) {
      return;
    }

    this.tryOn
      .cancelJob(
        current.id
      )
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        )
      )
      .subscribe({
        next: (cancelled) => {
          this.job.set(
            cancelled
          );
          this.running.set(false);
        },
        error: (error) => {
          this.error.set(
            this.messageFromError(
              error,
              'No fue posible cancelar la generación.'
            )
          );
        }
      });
  }

  primaryImage(
    product: Product
  ): string {
    return [...product.images]
      .sort(
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
      )[0]?.imageUrl ?? '';
  }

  variantLabel(
    variant: ProductVariant
  ): string {
    return (
      `${variant.color} · ` +
      `Talla ${variant.size}`
    );
  }

  private poll(
    jobId: string
  ): void {
    timer(0, 1500)
      .pipe(
        switchMap(() =>
          this.tryOn.getJob(
            jobId
          )
        ),
        takeWhile(
          (current) =>
            ![
              'SUCCEEDED',
              'FAILED',
              'CANCELLED'
            ].includes(
              current.status
            ),
          true
        ),
        takeUntilDestroyed(
          this.destroyRef
        ),
        finalize(() => {
          const status =
            this.job()?.status;

          if (
            status === 'FAILED' ||
            status === 'CANCELLED'
          ) {
            this.running.set(false);
          }
        }),
        catchError((error) => {
          this.running.set(false);
          this.error.set(
            this.messageFromError(
              error,
              'Se perdió la conexión con la generación.'
            )
          );

          return of(null);
        })
      )
      .subscribe((current) => {
        if (!current) {
          return;
        }

        this.job.set(
          current
        );

        if (
          current.status ===
          'SUCCEEDED'
        ) {
          this.loadResult(
            current.id
          );
        }
        else if (
          current.status ===
          'FAILED'
        ) {
          this.running.set(false);
          this.error.set(
            current.errorMessage ||
            'No se pudo generar la prueba virtual.'
          );
        }
        else if (
          current.status ===
          'CANCELLED'
        ) {
          this.running.set(false);
        }
      });
  }

  private loadResult(
    jobId: string
  ): void {
    this.tryOn
      .result(
        jobId
      )
      .pipe(
        takeUntilDestroyed(
          this.destroyRef
        )
      )
      .subscribe({
        next: (blob) => {
          this.replaceResultUrl(
            URL.createObjectURL(
              blob
            )
          );
          this.running.set(false);
        },
        error: (error) => {
          this.running.set(false);
          this.error.set(
            this.messageFromError(
              error,
              'El resultado terminó, pero no pudo descargarse.'
            )
          );
        }
      });
  }

  private clearResult(): void {
    this.replaceResultUrl('');
  }

  private replacePersonPreview(
    next: string
  ): void {
    const current =
      this.personPreviewUrl();

    if (current) {
      URL.revokeObjectURL(
        current
      );
    }

    this.personPreviewUrl.set(
      next
    );
  }

  private replaceResultUrl(
    next: string
  ): void {
    const current =
      this.resultUrl();

    if (current) {
      URL.revokeObjectURL(
        current
      );
    }

    this.resultUrl.set(
      next
    );
  }

  private messageFromError(
    error: unknown,
    fallback: string
  ): string {
    if (
      typeof error ===
        'object' &&
      error !== null &&
      'error' in error
    ) {
      const payload =
        (
          error as {
            error?: {
              message?: string;
            };
          }
        ).error;

      if (
        payload?.message
      ) {
        return payload.message;
      }
    }

    return fallback;
  }
}
