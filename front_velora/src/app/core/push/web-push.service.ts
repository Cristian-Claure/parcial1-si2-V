import {
  HttpClient
} from '@angular/common/http';
import {
  Injectable,
  inject,
  signal
} from '@angular/core';
import {
  firstValueFrom
} from 'rxjs';

import {
  Router
} from '@angular/router';

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
  onMessage,
  onRegistered,
  onUnregistered,
  register,
  unregister
} from 'firebase/messaging';
import type {
  MessagePayload,
  Messaging
} from 'firebase/messaging';

import {
  FeedbackService
} from '../feedback/feedback.service';
import {
  VELORA_FIREBASE_MESSAGING_SW_SCOPE,
  VELORA_FIREBASE_MESSAGING_SW_URL,
  VELORA_FIREBASE_WEB_CONFIG,
  VELORA_FIREBASE_WEB_VAPID_KEY
} from './firebase-web.config';

const WEB_FID_KEY =
  'velora_web_push_fid';

export type WebPushPermissionState =
  | NotificationPermission
  | 'unsupported';

export type WebPushEnableResult =
  | 'enabled'
  | 'denied'
  | 'unsupported'
  | 'error';

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

  private readonly feedback =
    inject(FeedbackService);

  private readonly router =
    inject(Router);

  readonly permissionState =
    signal<WebPushPermissionState>(
      this.readBrowserPermission()
    );

  readonly permissionBusy =
    signal(false);

  readonly installationRegistered =
    signal(false);

  private messagingPromise:
    Promise<Messaging | null> |
    null = null;

  private workerPromise:
    Promise<ServiceWorkerRegistration> |
    null = null;

  private listenersBound = false;

  private serviceWorkerMessageBound = false;

  private registerInFlight:
    Promise<boolean> |
    null = null;

  private registrationResolver:
    ((registered: boolean) => void) |
    null = null;

  private registrationTimeout:
    ReturnType<typeof setTimeout> |
    null = null;

  private revokingForLogout = false;

  constructor() {
    this.bindServiceWorkerMessages();
  }

  async enableNotifications():
    Promise<WebPushEnableResult> {
    if (this.permissionBusy()) {
      return this.permissionState() ===
        'granted'
        ? 'enabled'
        : 'error';
    }

    this.permissionBusy.set(true);

    try {
      if (
        !this.isBrowserPushAvailable() ||
        !(await isSupported())
      ) {
        this.permissionState.set(
          'unsupported'
        );
        return 'unsupported';
      }

      let permission =
        Notification.permission;

      if (permission === 'default') {
        permission =
          await Notification
            .requestPermission();
      }

      this.permissionState.set(
        permission
      );

      if (permission === 'denied') {
        return 'denied';
      }

      if (permission !== 'granted') {
        return 'error';
      }

      const registered =
        await this.syncIfPermissionGranted();

      return registered
        ? 'enabled'
        : 'error';
    } catch {
      return 'error';
    } finally {
      this.permissionBusy.set(false);
    }
  }

  async syncIfPermissionGranted():
    Promise<boolean> {
    if (!this.isBrowserPushAvailable()) {
      this.permissionState.set(
        'unsupported'
      );
      this.installationRegistered.set(
        false
      );
      return false;
    }

    this.permissionState.set(
      Notification.permission
    );

    if (
      Notification.permission !==
        'granted'
    ) {
      this.installationRegistered.set(
        false
      );
      return false;
    }

    if (!(await isSupported())) {
      this.permissionState.set(
        'unsupported'
      );
      this.installationRegistered.set(
        false
      );
      return false;
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

    this.revokingForLogout = true;

    try {
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
          // Best effort: backend revocation remains authoritative.
        }
      }
    } finally {
      this.clearStoredFid();
      this.revokingForLogout = false;
    }
  }

  private async registerCurrentInstallation():
    Promise<boolean> {
    const messaging =
      await this.messaging();

    if (!messaging) {
      this.installationRegistered.set(
        false
      );
      return false;
    }

    this.bindLifecycleListeners(
      messaging
    );

    const worker =
      await this.messagingWorker();

    const registrationResult =
      new Promise<boolean>(
        (resolve) => {
          this.registrationResolver =
            resolve;

          this.registrationTimeout =
            setTimeout(
              () => {
                this.completeRegistrationAttempt(
                  this.installationRegistered()
                );
              },
              5000
            );
        }
      );

    try {
      await register(
        messaging,
        {
          vapidKey:
            VELORA_FIREBASE_WEB_VAPID_KEY,
          serviceWorkerRegistration:
            worker
        }
      );

      return await registrationResult;
    } catch (error) {
      this.completeRegistrationAttempt(
        false
      );
      throw error;
    }
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
        ).then(
          (registered) => {
            this.completeRegistrationAttempt(
              registered
            );
          }
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

        this.installationRegistered.set(
          false
        );

        if (!this.revokingForLogout) {
          void this.revokeBackend(
            fid
          );
        }
      }
    );

    onMessage(
      messaging,
      (payload) => {
        this.showForegroundMessage(
          payload
        );
      }
    );
  }

  private showForegroundMessage(
    payload: MessagePayload
  ): void {
    const type =
      payload.data?.['type'] ??
      '';

    const title =
      payload.data?.['title'] ??
      payload.notification?.title ??
      this.titleForType(type);

    const body =
      payload.data?.['body'] ??
      payload.notification?.body ??
      'Hay una actualización disponible en VÉLORA.';

    this.feedback.info(
      title,
      body,
      5200
    );
  }

  private titleForType(
    type: string
  ): string {
    switch (type) {
      case 'ORDER_CONFIRMED':
        return 'Pedido confirmado';
      case 'PAYMENT_CONFIRMED':
        return 'Pago confirmado';
      case 'ORDER_READY_PICKUP':
        return 'Pedido listo para recoger';
      case 'ORDER_SHIPPED':
        return 'Tu pedido va en camino';
      case 'ORDER_CANCELLED':
        return 'Pedido cancelado';
      default:
        return 'Actualización de tu pedido';
    }
  }

  private async syncFid(
    rawFid: string
  ): Promise<boolean> {
    const fid =
      rawFid.trim();

    if (!fid) {
      this.installationRegistered.set(
        false
      );
      return false;
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
      this.installationRegistered.set(
        true
      );
      return true;
    } catch {
      this.installationRegistered.set(
        false
      );
      return false;
    }
  }

  private completeRegistrationAttempt(
    registered: boolean
  ): void {
    if (this.registrationTimeout) {
      clearTimeout(
        this.registrationTimeout
      );
      this.registrationTimeout = null;
    }

    const resolve =
      this.registrationResolver;

    this.registrationResolver = null;

    if (resolve) {
      resolve(
        registered
      );
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
      // Best effort during logout/unregister.
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

  private bindServiceWorkerMessages():
    void {
    if (
      this.serviceWorkerMessageBound ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    this.serviceWorkerMessageBound = true;

    navigator.serviceWorker.addEventListener(
      'message',
      (event: MessageEvent<unknown>) => {
        const data =
          event.data;

        if (
          !data ||
          typeof data !== 'object'
        ) {
          return;
        }

        const message =
          data as {
            type?: unknown;
            route?: unknown;
          };

        if (
          message.type !==
            'VELORA_PUSH_NAVIGATE' ||
          message.route !==
            '/mis-pedidos'
        ) {
          return;
        }

        void this.router.navigateByUrl(
          '/mis-pedidos'
        );
      }
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

  private readBrowserPermission():
    WebPushPermissionState {
    if (!this.isBrowserPushAvailable()) {
      return 'unsupported';
    }

    return Notification.permission;
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
    this.installationRegistered.set(
      false
    );

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
