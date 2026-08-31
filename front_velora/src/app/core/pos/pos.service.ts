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
  CashMovement,
  CashMovementPayload,
  CashSession,
  CloseCashSessionPayload,
  CreatePosSalePayload,
  OpenCashSessionPayload,
  PointOfSale,
  PosPaymentConfirmation,
  PosPaymentResolution,
  PosSale
} from './pos.models';

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly http =
    inject(HttpClient);

  private readonly auth =
    inject(AuthService);

  pointsOfSale() {
    return this.http.get<PointOfSale[]>(
      `${this.baseUrl()}/points-of-sale`
    );
  }

  openSession(
    payload: OpenCashSessionPayload
  ) {
    return this.http.post<CashSession>(
      `${this.baseUrl()}/cash-sessions/open`,
      payload
    );
  }

  getOpenSession(
    pointOfSaleId: string
  ) {
    return this.http.get<CashSession>(
      `${this.baseUrl()}/cash-sessions/open/${pointOfSaleId}`
    );
  }

  movements(
    sessionId: string
  ) {
    return this.http.get<CashMovement[]>(
      `${this.baseUrl()}/cash-sessions/${sessionId}/movements`
    );
  }

  registerMovement(
    sessionId: string,
    payload: CashMovementPayload
  ) {
    return this.http.post<CashMovement>(
      `${this.baseUrl()}/cash-sessions/${sessionId}/movements`,
      payload
    );
  }

  closeSession(
    sessionId: string,
    payload: CloseCashSessionPayload
  ) {
    return this.http.post<CashSession>(
      `${this.baseUrl()}/cash-sessions/${sessionId}/close`,
      payload
    );
  }

  createSale(
    payload: CreatePosSalePayload
  ) {
    return this.http.post<PosSale>(
      `${this.baseUrl()}/pos/sales`,
      payload
    );
  }

  confirmSalePayment(
    paymentId: string,
    reason: string | null
  ) {
    return this.http.post<PosPaymentConfirmation>(
      `${this.baseUrl()}/pos/sales/payments/${paymentId}/confirm`,
      { reason }
    );
  }

  failSalePayment(
    paymentId: string,
    reason: string
  ) {
    return this.http.post<PosPaymentResolution>(
      `${this.baseUrl()}/pos/sales/payments/${paymentId}/fail`,
      { reason }
    );
  }

  cancelSalePayment(
    paymentId: string,
    reason: string
  ) {
    return this.http.post<PosPaymentResolution>(
      `${this.baseUrl()}/pos/sales/payments/${paymentId}/cancel`,
      { reason }
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
      'Rol no autorizado para operar POS.'
    );
  }
}