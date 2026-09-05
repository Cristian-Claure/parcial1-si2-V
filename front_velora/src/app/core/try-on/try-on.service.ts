import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateTryOnJobPayload,
  TryOnJob
} from './try-on.models';

@Injectable({
  providedIn: 'root'
})
export class TryOnService {
  private readonly http = inject(HttpClient);

  createJob(
    payload: CreateTryOnJobPayload
  ): Observable<TryOnJob> {
    const body = new FormData();

    body.append(
      'productId',
      payload.productId
    );

    if (payload.variantId) {
      body.append(
        'variantId',
        payload.variantId
      );
    }

    body.append(
      'person',
      payload.person,
      payload.person.name
    );

    // El CUSTOMER no elige proveedor.
    // Spring usa la configuración activa del entorno.
    return this.http.post<TryOnJob>(
      '/api/customer/try-on/jobs',
      body
    );
  }

  getJob(
    jobId: string
  ): Observable<TryOnJob> {
    return this.http.get<TryOnJob>(
      `/api/customer/try-on/jobs/${jobId}`
    );
  }

  cancelJob(
    jobId: string
  ): Observable<TryOnJob> {
    return this.http.delete<TryOnJob>(
      `/api/customer/try-on/jobs/${jobId}`
    );
  }

  result(
    jobId: string
  ): Observable<Blob> {
    return this.http.get(
      `/api/customer/try-on/jobs/${jobId}/result`,
      {
        responseType: 'blob'
      }
    );
  }
}
