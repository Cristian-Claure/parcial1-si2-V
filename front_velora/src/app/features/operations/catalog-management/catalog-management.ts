import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  Category,
  Product,
  ProductImagePurpose,
  ProductVariant,
  TryOnCategory
} from '../../../core/catalog/catalog.models';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { RoleShell } from '../../../shared/role-shell/role-shell';

const TRY_ON_CATEGORY_LABELS: Record<TryOnCategory, string> = {
  TOP: 'Parte superior',
  BOTTOM: 'Parte inferior',
  DRESS: 'Vestido / enterizo',
  OUTERWEAR: 'Abrigo / chaqueta',
  SHOES: 'Calzado',
  ACCESSORY: 'Accesorio'
};

const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CATALOG_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

@Component({
  selector: 'app-catalog-management',
  standalone: true,
  imports: [ReactiveFormsModule, RoleShell],
  templateUrl: './catalog-management.html',
  styleUrl: './catalog-management.scss'
})
export class CatalogManagement {
  private readonly catalog = inject(CatalogService);
  private readonly fb = inject(FormBuilder);

  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly message = signal('');
  readonly error = signal('');
  readonly selectedImageFile = signal<File | null>(null);
  readonly uploadingImage = signal(false);

  readonly tryOnCategories = Object.entries(
    TRY_ON_CATEGORY_LABELS
  ) as Array<[TryOnCategory, string]>;

  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    description: [''],
    parentId: ['']
  });

  readonly productForm = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    name: ['', Validators.required],
    slug: ['', Validators.required],
    description: [''],
    brand: ['VÉLORA', Validators.required],
    composition: [''],
    careInstructions: [''],
    fitNotes: [''],
    tryOnEnabled: [false],
    tryOnCategory: ['']
  });

  readonly variantForm = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    sku: ['', Validators.required],
    barcode: [''],
    size: ['', Validators.required],
    color: ['', Validators.required],
    colorHex: [''],
    price: [0, [Validators.required, Validators.min(0.01)]],
    compareAtPrice: [0]
  });

  readonly imageForm = this.fb.nonNullable.group({
    productId: ['', Validators.required],
    variantId: [''],
    imageUrl: [''],
    altText: [''],
    purpose: [
      'GALLERY' as ProductImagePurpose,
      Validators.required
    ],
    sortOrder: [0, Validators.min(0)],
    primary: [false]
  });

  constructor() {
    this.reload();
  }

  createCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const value = this.categoryForm.getRawValue();

    this.clearFeedback();

    this.catalog.createCategory({
      name: value.name.trim(),
      slug: value.slug.trim(),
      description: this.nullIfBlank(value.description),
      parentId: value.parentId || null,
      active: true
    }).subscribe({
      next: () => {
        this.message.set('Categoría creada correctamente.');
        this.categoryForm.reset({
          name: '',
          slug: '',
          description: '',
          parentId: ''
        });
        this.reload();
      },
      error: (error: HttpErrorResponse) => this.handleError(error)
    });
  }

  createProduct(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    const value = this.productForm.getRawValue();

    if (value.tryOnEnabled && !value.tryOnCategory) {
      this.error.set(
        'Seleccione la categoría del probador virtual antes de habilitar el producto.'
      );
      return;
    }

    this.clearFeedback();

    this.catalog.createProduct({
      categoryId: value.categoryId,
      name: value.name.trim(),
      slug: value.slug.trim(),
      description: this.nullIfBlank(value.description),
      brand: value.brand.trim(),
      composition: this.nullIfBlank(value.composition),
      careInstructions: this.nullIfBlank(value.careInstructions),
      fitNotes: this.nullIfBlank(value.fitNotes),
      status: 'ACTIVE',
      tryOnEnabled: value.tryOnEnabled,
      tryOnCategory:
        value.tryOnEnabled
          ? value.tryOnCategory as TryOnCategory
          : null
    }).subscribe({
      next: () => {
        this.message.set('Producto creado correctamente.');
        this.productForm.reset({
          categoryId: '',
          name: '',
          slug: '',
          description: '',
          brand: 'VÉLORA',
          composition: '',
          careInstructions: '',
          fitNotes: '',
          tryOnEnabled: false,
          tryOnCategory: ''
        });
        this.reload();
      },
      error: (error: HttpErrorResponse) => this.handleError(error)
    });
  }

  createVariant(): void {
    if (this.variantForm.invalid) {
      this.variantForm.markAllAsTouched();
      return;
    }

    const value = this.variantForm.getRawValue();

    this.clearFeedback();

    this.catalog.createVariant(value.productId, {
      sku: value.sku.trim(),
      barcode: this.nullIfBlank(value.barcode),
      size: value.size.trim(),
      color: value.color.trim(),
      colorHex: this.nullIfBlank(value.colorHex),
      price: Number(value.price),
      compareAtPrice:
        Number(value.compareAtPrice) > 0
          ? Number(value.compareAtPrice)
          : null,
      currency: 'BOB',
      active: true
    }).subscribe({
      next: () => {
        this.message.set('Variante creada correctamente.');
        this.variantForm.reset({
          productId: '',
          sku: '',
          barcode: '',
          size: '',
          color: '',
          colorHex: '',
          price: 0,
          compareAtPrice: 0
        });
        this.reload();
      },
      error: (error: HttpErrorResponse) => this.handleError(error)
    });
  }

  createImage(): void {
    if (this.imageForm.invalid) {
      this.imageForm.markAllAsTouched();
      return;
    }

    const value = this.imageForm.getRawValue();
    const imageUrl = value.imageUrl.trim();

    if (!imageUrl) {
      this.error.set(
        'Ingrese una URL de imagen o use la opción de subir archivo.'
      );
      return;
    }

    this.clearFeedback();

    this.catalog.createImage(value.productId, {
      variantId: value.variantId || null,
      imageUrl,
      altText: this.nullIfBlank(value.altText),
      purpose: value.purpose,
      sortOrder: Number(value.sortOrder),
      primary: value.primary
    }).subscribe({
      next: () => {
        this.message.set(
          value.purpose === 'TRY_ON_GARMENT'
            ? 'Imagen de prenda para probador registrada correctamente.'
            : 'Imagen de catálogo registrada correctamente.'
        );
        this.resetImageForm();
        this.reload();
      },
      error: (error: HttpErrorResponse) => this.handleError(error)
    });
  }

  onImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.clearFeedback();

    if (!file) {
      this.selectedImageFile.set(null);
      return;
    }

    if (!ALLOWED_CATALOG_IMAGE_TYPES.has(file.type)) {
      this.selectedImageFile.set(null);
      input.value = '';
      this.error.set(
        'Solo se permiten imágenes JPG/JPEG, PNG o WEBP.'
      );
      return;
    }

    if (file.size > MAX_CATALOG_IMAGE_BYTES) {
      this.selectedImageFile.set(null);
      input.value = '';
      this.error.set(
        'La imagen no puede superar 5 MB.'
      );
      return;
    }

    this.selectedImageFile.set(file);
  }

  clearImageFile(): void {
    this.selectedImageFile.set(null);
  }

  uploadImage(): void {
    if (this.imageForm.invalid) {
      this.imageForm.markAllAsTouched();
      return;
    }

    const file = this.selectedImageFile();

    if (!file) {
      this.error.set(
        'Seleccione una imagen JPG/JPEG, PNG o WEBP.'
      );
      return;
    }

    const value = this.imageForm.getRawValue();

    this.clearFeedback();
    this.uploadingImage.set(true);

    this.catalog.uploadImage(value.productId, {
      variantId: value.variantId || null,
      altText: this.nullIfBlank(value.altText),
      purpose: value.purpose,
      sortOrder: Number(value.sortOrder),
      primary: value.primary,
      file
    }).subscribe({
      next: () => {
        this.message.set(
          value.purpose === 'TRY_ON_GARMENT'
            ? 'Prenda Try-On subida y registrada correctamente.'
            : 'Imagen de catálogo subida y registrada correctamente.'
        );
        this.resetImageForm();
        this.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.uploadingImage.set(false);
        this.handleError(error);
      },
      complete: () => this.uploadingImage.set(false)
    });
  }

  selectedImageSizeLabel(file: File): string {
    const megabytes = file.size / (1024 * 1024);
    return `${megabytes.toFixed(2)} MB`;
  }

  imageVariants(): ProductVariant[] {
    const productId = this.imageForm.controls.productId.value;

    return this.products().find(
      product => product.id === productId
    )?.variants ?? [];
  }

  tryOnCategoryLabel(
    category: TryOnCategory | null
  ): string {
    return category
      ? TRY_ON_CATEGORY_LABELS[category]
      : 'Sin categoría';
  }

  private resetImageForm(): void {
    this.imageForm.reset({
      productId: '',
      variantId: '',
      imageUrl: '',
      altText: '',
      purpose: 'GALLERY',
      sortOrder: 0,
      primary: false
    });
    this.selectedImageFile.set(null);
  }

  private reload(): void {
    this.catalog.managedCategories().subscribe({
      next: (categories) => this.categories.set(categories)
    });

    this.catalog.managedProducts().subscribe({
      next: (products) => this.products.set(products)
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

  private nullIfBlank(value: string): string | null {
    const clean = value.trim();
    return clean.length ? clean : null;
  }
}
