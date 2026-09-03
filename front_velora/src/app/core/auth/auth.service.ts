import { WebPushService } from '../push/web-push.service';
import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  UserProfile
} from './auth.models';

const TOKEN_KEY = 'velora_access_token';
const USER_KEY = 'velora_current_user';

function readStoredUser(): UserProfile | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly webPush =
    inject(WebPushService);
  private readonly http = inject(HttpClient);

  private readonly tokenState = signal<string | null>(
    typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(TOKEN_KEY)
  );

  readonly currentUser =
    signal<UserProfile | null>(readStoredUser());

  readonly isAuthenticated = computed(
    () => Boolean(
      this.tokenState() &&
      this.currentUser()
    )
  );

  constructor() {
    if (this.tokenState()) {
      this.refreshProfile().subscribe({
        error: (error: HttpErrorResponse) => {
          if (
            error.status === 401 ||
            error.status === 403
          ) {
            this.clearSession();
          }
        }
      });
    }
  }

  login(
    payload: LoginPayload
  ): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      '/api/auth/login',
      payload
    ).pipe(
      tap((response) => this.saveSession(response))
    );
  }

  register(
    payload: RegisterPayload
  ): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      '/api/auth/register',
      payload
    );
  }

  refreshProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      '/api/auth/me'
    ).pipe(
      tap((user) => {
        this.currentUser.set(user);

        localStorage.setItem(
          USER_KEY,
          JSON.stringify(user)
        );
      })
    );
  }

  accessToken(): string | null {
    return this.tokenState();
  }

  logout(): void {
    void this.webPush
      .revokeForLogout();

    this.clearSession();
  }

  private saveSession(
    response: AuthResponse
  ): void {
    localStorage.setItem(
      TOKEN_KEY,
      response.accessToken
    );

    localStorage.setItem(
      USER_KEY,
      JSON.stringify(response.user)
    );

    this.tokenState.set(
      response.accessToken
    );

    this.currentUser.set(
      response.user
    );
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    this.tokenState.set(null);
    this.currentUser.set(null);
  }
}