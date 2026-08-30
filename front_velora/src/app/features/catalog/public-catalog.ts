import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Product } from '../../core/catalog/catalog.models';
import { CatalogService } from '../../core/catalog/catalog.service';

@Component({
  selector: 'app-public-catalog',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './public-catalog.html',
  styleUrl: './public-catalog.scss'
})
export class PublicCatalog {
  private readonly catalog = inject(CatalogService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el catálogo.');
        this.loading.set(false);
      }
    });
  }

  lowestPrice(product: Product): number | null {
    const prices = product.variants
      .filter((variant) => variant.active)
      .map((variant) => variant.price);

    return prices.length ? Math.min(...prices) : null;
  }
}