import {
  HttpClient,
  HttpParams
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string;
  category: string;
  httpMethod: string;
  routePattern: string;
  requestPath: string;
  statusCode: number;
  success: boolean;
  requestId: string | null;
}

export interface AuditEventPage {
  content: AuditEvent[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export interface AuditEventQuery {
  actorId?: string | null;
  role?: string | null;
  category?: string | null;
  method?: string | null;
  success?: boolean | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  page?: number;
  size?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private readonly http =
    inject(HttpClient);

  search(
    query: AuditEventQuery
  ) {
    let params =
      new HttpParams()
        .set(
          'page',
          String(query.page ?? 0)
        )
        .set(
          'size',
          String(query.size ?? 25)
        );

    params =
      this.optionalParam(
        params,
        'actorId',
        query.actorId
      );

    params =
      this.optionalParam(
        params,
        'role',
        query.role
      );

    params =
      this.optionalParam(
        params,
        'category',
        query.category
      );

    params =
      this.optionalParam(
        params,
        'method',
        query.method
      );

    if (
      query.success !== null &&
      query.success !== undefined
    ) {
      params =
        params.set(
          'success',
          String(query.success)
        );
    }

    params =
      this.optionalParam(
        params,
        'from',
        query.from
      );

    params =
      this.optionalParam(
        params,
        'to',
        query.to
      );

    params =
      this.optionalParam(
        params,
        'q',
        query.q
      );

    return this.http.get<AuditEventPage>(
      '/api/admin/audit',
      {
        params
      }
    );
  }

  private optionalParam(
    params: HttpParams,
    key: string,
    value?: string | null
  ): HttpParams {
    const normalized =
      value?.trim();

    if (!normalized) {
      return params;
    }

    return params.set(
      key,
      normalized
    );
  }
}
