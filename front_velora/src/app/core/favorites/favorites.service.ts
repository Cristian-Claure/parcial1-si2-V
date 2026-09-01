import {
  HttpClient
} from '@angular/common/http';

import {
  Injectable,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  Observable,
  tap
} from 'rxjs';

import {
  CustomerFavorite
} from './favorites.models';

@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private readonly http =
    inject(HttpClient);

  readonly items =
    signal<CustomerFavorite[]>([]);

  readonly productIds =
    computed(
      () =>
        new Set(
          this.items().map(
            (favorite) =>
              favorite.productId
          )
        )
    );

  load():
    Observable<CustomerFavorite[]> {
    return this.http
      .get<CustomerFavorite[]>(
        '/api/customer/favorites'
      )
      .pipe(
        tap(
          (favorites) =>
            this.items.set(
              favorites
            )
        )
      );
  }

  add(
    productId: string
  ): Observable<CustomerFavorite> {
    return this.http
      .post<CustomerFavorite>(
        `/api/customer/favorites/${productId}`,
        {}
      )
      .pipe(
        tap(
          (favorite) => {
            const existing =
              this.items().filter(
                (item) =>
                  item.productId !==
                  productId
              );

            this.items.set([
              favorite,
              ...existing
            ]);
          }
        )
      );
  }

  remove(
    productId: string
  ): Observable<void> {
    return this.http
      .delete<void>(
        `/api/customer/favorites/${productId}`
      )
      .pipe(
        tap(
          () =>
            this.items.update(
              (favorites) =>
                favorites.filter(
                  (favorite) =>
                    favorite.productId !==
                    productId
                )
            )
        )
      );
  }

  isFavorite(
    productId: string
  ): boolean {
    return this.productIds()
      .has(productId);
  }
}