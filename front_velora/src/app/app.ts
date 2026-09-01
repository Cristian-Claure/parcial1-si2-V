import { Component, computed, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet
} from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './core/auth/auth.service';

import {
  CustomerOfflineOrderQueueService
} from './core/offline/customer-offline-order-queue.service';
import {
  Category,
  Product
} from './core/catalog/catalog.models';
import { CatalogService } from './core/catalog/catalog.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);

  private readonly customerOfflineOrders =
    inject(CustomerOfflineOrderQueueService);

  readonly auth = inject(AuthService);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly catalogLoading = signal(true);

  readonly isHome = signal(
    this.isHomeUrl(this.router.url)
  );

  readonly featuredProducts = computed(() =>
    this.products()
      .filter((product) => product.status === 'ACTIVE')
      .slice(0, 3)
  );

  readonly activeCategories = computed(() =>
    this.categories()
      .filter((category) => category.active)
      .slice(0, 6)
  );

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd =>
            event instanceof NavigationEnd
        )
      )
      .subscribe((event) => {
        this.isHome.set(
          this.isHomeUrl(event.urlAfterRedirects)
        );
      });

    this.loadCatalog();
  }

  lowestPrice(product: Product): number | null {
    const prices = product.variants
      .filter((variant) => variant.active)
      .map((variant) => variant.price);

    return prices.length
      ? Math.min(...prices)
      : null;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }
  private isHomeUrl(url: string): boolean {
    const path = url
      .split('#')[0]
      .split('?')[0];

    return path === '/';
  }

  private loadCatalog(): void {
    this.catalog.publicCategories().subscribe({
      next: (categories) =>
        this.categories.set(categories)
    });

    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.catalogLoading.set(false);
      },
      error: () => {
        this.catalogLoading.set(false);
      }
    });
  }
}