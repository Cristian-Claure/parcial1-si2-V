import { Routes } from '@angular/router';

import { authGuard, roleGuard } from './core/auth/auth.guard';
import { HomeRoute } from './features/home/home-route';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: HomeRoute },
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./features/catalog/public-catalog').then((m) => m.PublicCatalog)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login)
  },
  {
    path: 'registro',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register)
  },
  {
    path: 'mi-cuenta',
    canActivate: [authGuard, roleGuard(['CUSTOMER'])],
    loadComponent: () => import('./features/account/account').then((m) => m.Account)
  },
  {
    path: 'admin/catalogo',
    canActivate: [authGuard, roleGuard(['ADMIN'])],
    loadComponent: () =>
      import('./features/operations/catalog-management/catalog-management')
        .then((m) => m.CatalogManagement)
  },
  {
    path: 'admin/inventario',
    canActivate: [authGuard, roleGuard(['ADMIN'])],
    loadComponent: () =>
      import('./features/operations/inventory-management/inventory-management')
        .then((m) => m.InventoryManagement)
  },
  {
    path: 'sucursal/catalogo',
    canActivate: [authGuard, roleGuard(['STORE_MANAGER'])],
    loadComponent: () =>
      import('./features/operations/catalog-management/catalog-management')
        .then((m) => m.CatalogManagement)
  },
  {
    path: 'sucursal/inventario',
    canActivate: [authGuard, roleGuard(['STORE_MANAGER'])],
    loadComponent: () =>
      import('./features/operations/inventory-management/inventory-management')
        .then((m) => m.InventoryManagement)
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['ADMIN'])],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin)
  },
  {
    path: 'sucursal',
    canActivate: [authGuard, roleGuard(['STORE_MANAGER'])],
    loadComponent: () => import('./features/manager/manager').then((m) => m.Manager)
  },
  { path: '**', redirectTo: '' }
];
