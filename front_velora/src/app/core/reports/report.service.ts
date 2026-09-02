import {
  HttpClient
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

import {
  AuthService
} from '../auth/auth.service';

import {
  ReportAiNarrativeRequest,
  ReportAiNarrativeResponse,
  ReportAiQueryResponse,
  ReportOverview
} from './report.models';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly http =
    inject(HttpClient);

  private readonly auth =
    inject(AuthService);

  overview() {
    return this.http.get<ReportOverview>(
      `${this.baseUrl()}/reports/overview`
    );
  }

  query(
    question: string
  ) {
    return this.http.post<ReportAiQueryResponse>(
      `${this.baseUrl()}/reports/ai-query`,
      {
        question
      }
    );
  }

  narrative(
    payload: ReportAiNarrativeRequest
  ) {
    return this.http.post<ReportAiNarrativeResponse>(
      `${this.baseUrl()}/reports/ai-narrative`,
      payload
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