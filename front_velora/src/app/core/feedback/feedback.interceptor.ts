import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';

import {
  inject
} from '@angular/core';

import {
  catchError,
  throwError
} from 'rxjs';

import {
  FeedbackService
} from './feedback.service';

export const feedbackInterceptor:
  HttpInterceptorFn =
    (request, next) => {
      const feedback =
        inject(FeedbackService);

      return next(request).pipe(
        catchError(
          (error: unknown) => {
            if (
              request.url.includes(
                '/api/health'
              )
            ) {
              return throwError(
                () => error
              );
            }

            if (
              error instanceof
                HttpErrorResponse
            ) {
              if (error.status === 0) {
                feedback.error(
                  'Sin conexión',
                  'No pudimos contactar con VÉLORA. Revise su conexión; las funciones offline disponibles seguirán activas.'
                );
              }
              else if (
                error.status >= 500
              ) {
                feedback.error(
                  'Servicio temporalmente no disponible',
                  'VÉLORA encontró un problema al procesar la solicitud. Intente nuevamente en unos instantes.'
                );
              }
            }

            return throwError(
              () => error
            );
          }
        )
      );
    };