import {
  HttpClient,
  HttpParams
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

import {
  AuthService
} from '../auth/auth.service';

import {
  ReportAiQueryResponse,
  ReportOverview,
  ReportPeriodBounds
} from './report.models';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly http =
    inject(HttpClient);

  private readonly auth =
    inject(AuthService);

  overview(
    fromDate?: string | null,
    toDate?: string | null
  ) {
    let params =
      new HttpParams();

    if (fromDate) {
      params =
        params.set(
          'from',
          fromDate
        );
    }

    if (toDate) {
      params =
        params.set(
          'to',
          toDate
        );
    }

    return this.http.get<ReportOverview>(
      `${this.baseUrl()}/reports/overview`,
      {
        params
      }
    );
  }

  periodBounds() {
    return this.http.get<ReportPeriodBounds>(
      `${this.baseUrl()}/reports/period-bounds`
    );
  }

  query(
    question: string,
    fromDate?: string | null,
    toDate?: string | null
  ) {
    return this.http.post<ReportAiQueryResponse>(
      `${this.baseUrl()}/reports/ai-query`,
      {
        question,
        fromDate:
          fromDate || null,
        toDate:
          toDate || null,
        storeId: null
      }
    );
  }

  private baseUrl(): string {
    const role =
      this.auth.currentUser()?.role;

    if (role === 'ADMIN') {
      return '/api/admin';
    }

    if (role === 'STORE_MANAGER') {
      return '/api/manager';
    }

    throw new Error(
      'El usuario actual no puede consultar reportes.'
    );
  }
}
