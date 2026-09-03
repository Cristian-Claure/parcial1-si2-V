import {
  HttpClient
} from '@angular/common/http';
import {
  Injectable,
  inject
} from '@angular/core';
import {
  firstValueFrom
} from 'rxjs';

import {
  initializeApp,
  getApps
} from 'firebase/app';
import type {
  FirebaseApp
} from 'firebase/app';
import {
  getMessaging,
  isSupported,
  onRegistered,
  onUnregistered,
  register,
  unregister
} from 'firebase/messaging';
import type {
  Messaging
} from 'firebase/messaging';

import {
  VELORA_FIREBASE_MESSAGING_SW_SCOPE,
  VELORA_FIREBASE_MESSAGING_SW_URL,
  VELORA_FIREBASE_WEB_CONFIG,
  VELORA_FIREBASE_WEB_VAPID_KEY
} from './firebase-web.config';

const WEB_FID_KEY =
  'velora_web_push_fid';

interface PushInstallationPayload {
  installationId: string;
  platform: 'WEB';
  deviceLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebPushService {
  private readonly http =
    inject(HttpClient);

  private messagingPromise:
    Promise<Messaging | null> |
    null = null;

  private workerPromise:
    Promise<ServiceWorkerRegistration> |
    null = null;

  private listenersBound = false;

  private registerInFlight:
    Promise<void> |
    null = null;

  async syncIfPermissionGranted():
    Promise<void> {
    if (
      !this.isBrowserPushAvailable() ||
      Notification.permission !==
        'granted'
    ) {
      return;
    }

    if (this.registerInFlight) {
      return this.registerInFlight;
    }

    this.registerInFlight =
      this.registerCurrentInstallation()
        .finally(() => {
          this.registerInFlight = null;
        });

    return this.registerInFlight;
  }

  async revokeForLogout():
    Promise<void> {
    if (!this.isBrowserPushAvailable()) {
      this.clearStoredFid();
      return;
    }

    const storedFid =
      this.storedFid();

    if (storedFid) {
      await this.revokeBackend(
        storedFid
      );
    }

    const messaging =
      await this.messaging();

    if (messaging) {
      try {
        await unregister(
          messaging
        );
      } catch {
        // Best effort: el backend ya fue revocado.
      }
    }

    this.clearStoredFid();
  }

  private async registerCurrentInstallation():
    Promise<void> {
    const messaging =
      await this.messaging();

    if (!messaging) {
      return;
    }

    this.bindLifecycleListeners(
      messaging
    );

    const worker =
      await this.messagingWorker();

    await register(
      messaging,
      {
        vapidKey:
          VELORA_FIREBASE_WEB_VAPID_KEY,
        serviceWorkerRegistration:
          worker
      }
    );
  }

  private bindLifecycleListeners(
    messaging: Messaging
  ): void {
    if (this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    onRegistered(
      messaging,
      (fid) => {
        void this.syncFid(
          fid
        );
      }
    );

    onUnregistered(
      messaging,
      (fid) => {
        if (
          this.storedFid() ===
          fid
        ) {
          this.clearStoredFid();
        }

        void this.revokeBackend(
          fid
        );
      }
    );
  }

  private async syncFid(
    rawFid: string
  ): Promise<void> {
    const fid =
      rawFid.trim();

    if (!fid) {
      return;
    }

    const previousFid =
      this.storedFid();

    if (
      previousFid &&
      previousFid !== fid
    ) {
      await this.revokeBackend(
        previousFid
      );
    }

    const payload:
      PushInstallationPayload = {
        installationId: fid,
        platform: 'WEB',
        deviceLabel:
          this.deviceLabel()
      };

    try {
      await firstValueFrom(
        this.http.put(
          '/api/push/installations',
          payload
        )
      );

      this.storeFid(
        fid
      );
    } catch {
      // Best effort. onRegistered volverá a sincronizar
      // en futuros registros/refreshes del FID.
    }
  }

  private async revokeBackend(
    fid: string
  ): Promise<void> {
    const normalized =
      fid.trim();

    if (!normalized) {
      return;
    }

    try {
      await firstValueFrom(
        this.http.delete(
          '/api/push/installations',
          {
            params: {
              platform: 'WEB',
              installationId:
                normalized
            }
          }
        )
      );
    } catch {
      // Best effort durante logout/unregister.
    }
  }

  private messaging():
    Promise<Messaging | null> {
    if (this.messagingPromise) {
      return this.messagingPromise;
    }

    this.messagingPromise =
      this.createMessaging();

    return this.messagingPromise;
  }

  private async createMessaging():
    Promise<Messaging | null> {
    if (
      !this.isBrowserPushAvailable()
    ) {
      return null;
    }

    if (
      !(await isSupported())
    ) {
      return null;
    }

    const firebaseApp:
      FirebaseApp =
        getApps().length
          ? getApps()[0]
          : initializeApp(
              VELORA_FIREBASE_WEB_CONFIG
            );

    return getMessaging(
      firebaseApp
    );
  }

  private messagingWorker():
    Promise<ServiceWorkerRegistration> {
    if (this.workerPromise) {
      return this.workerPromise;
    }

    this.workerPromise =
      navigator.serviceWorker.register(
        VELORA_FIREBASE_MESSAGING_SW_URL,
        {
          scope:
            VELORA_FIREBASE_MESSAGING_SW_SCOPE
        }
      );

    return this.workerPromise;
  }

  private isBrowserPushAvailable():
    boolean {
    return (
      typeof window !==
        'undefined' &&
      typeof navigator !==
        'undefined' &&
      'serviceWorker' in
        navigator &&
      typeof Notification !==
        'undefined'
    );
  }

  private storedFid():
    string | null {
    if (
      typeof localStorage ===
        'undefined'
    ) {
      return null;
    }

    return localStorage.getItem(
      WEB_FID_KEY
    );
  }

  private storeFid(
    fid: string
  ): void {
    if (
      typeof localStorage ===
        'undefined'
    ) {
      return;
    }

    localStorage.setItem(
      WEB_FID_KEY,
      fid
    );
  }

  private clearStoredFid():
    void {
    if (
      typeof localStorage ===
        'undefined'
    ) {
      return;
    }

    localStorage.removeItem(
      WEB_FID_KEY
    );
  }

  private deviceLabel():
    string {
    if (
      typeof navigator ===
        'undefined'
    ) {
      return 'VÉLORA Web';
    }

    const userAgent =
      navigator.userAgent;

    const browser =
      userAgent.includes('Edg/')
        ? 'Edge'
        : userAgent.includes(
            'Firefox/'
          )
          ? 'Firefox'
          : userAgent.includes(
              'Chrome/'
            )
            ? 'Chrome'
            : userAgent.includes(
                'Safari/'
              )
              ? 'Safari'
              : 'Navegador';

    const system =
      userAgent.includes('Windows')
        ? 'Windows'
        : userAgent.includes(
            'Mac OS'
          )
          ? 'macOS'
          : userAgent.includes(
              'Android'
            )
            ? 'Android'
            : userAgent.includes(
                'Linux'
              )
              ? 'Linux'
              : 'Web';

    return `${browser} · ${system}`;
  }
}
