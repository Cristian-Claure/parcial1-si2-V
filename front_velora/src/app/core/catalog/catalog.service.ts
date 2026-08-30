import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { Category, Product, ProductVariant } from './catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  publicCategories() {
    return this.http.get<Category[]>('/api/catalog/categories');
  }

  publicProducts() {
    return this.http.get<Product[]>('/api/catalog/products');
  }

  managedCategories() {
    return this.http.get<Category[]>('/api/catalog/manage/categories');
  }

  managedProducts() {
    return this.http.get<Product[]>('/api/catalog/manage/products');
  }

  createCategory(payload: {
    name: string;
    slug: string;
    description: string | null;
    parentId: string | null;
    active: boolean;
  }) {
    return this.http.post<Category>('/api/catalog/manage/categories', payload);
  }

  createProduct(payload: {
    categoryId: string;
    name: string;
    slug: string;
    description: string | null;
    brand: string;
    composition: string | null;
    careInstructions: string | null;
    fitNotes: string | null;
    status: string;
  }) {
    return this.http.post<Product>('/api/catalog/manage/products', payload);
  }

  createVariant(productId: string, payload: {
    sku: string;
    barcode: string | null;
    size: string;
    color: string;
    colorHex: string | null;
    price: number;
    compareAtPrice: number | null;
    currency: string;
    active: boolean;
  }) {
    return this.http.post<ProductVariant>(
      `/api/catalog/manage/products/${productId}/variants`,
      payload
    );
  }
}