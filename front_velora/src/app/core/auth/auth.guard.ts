import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { UserRole } from './auth.models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.accessToken() ? true : router.createUrlTree(['/login']);
};

export const roleGuard = (roles: UserRole[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.currentUser();

    if (!auth.accessToken()) {
      return router.createUrlTree(['/login']);
    }

    if (!user) {
      return true;
    }

    return roles.includes(user.role)
      ? true
      : router.createUrlTree(['/mi-cuenta']);
  };
};
