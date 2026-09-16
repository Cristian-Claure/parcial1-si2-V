import { getApps, initializeApp } from "firebase/app";
import { getMessaging, isSupported, onMessage, onRegistered, onUnregistered, register, unregister, type MessagePayload, type Messaging } from "firebase/messaging";
import type { PushInstallationResponse } from "@velora/contracts";
import { apiRequest, jsonBody } from "../api/apiClient";
import { VELORA_FIREBASE_MESSAGING_SW_SCOPE, VELORA_FIREBASE_MESSAGING_SW_URL, VELORA_FIREBASE_WEB_CONFIG, VELORA_FIREBASE_WEB_VAPID_KEY } from "./firebase";

const WEB_FID_KEY = "velora_web_push_fid";
export type WebPushEnableResult = "enabled" | "denied" | "unsupported" | "error";

class WebPushManager {
  private messagingPromise: Promise<Messaging | null> | null = null;
  private workerPromise: Promise<ServiceWorkerRegistration> | null = null;
  private listenersBound = false;
  private registerInFlight: Promise<boolean> | null = null;
  private registrationResolver: ((registered: boolean) => void) | null = null;
  private registrationTimeout: ReturnType<typeof setTimeout> | null = null;
  private registered = false;

  constructor() {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data as { type?: unknown; route?: unknown } | null;
        if (data?.type !== "VELORA_PUSH_NAVIGATE") return;
        const route = data.route;
        if (typeof route === "string" && route.startsWith("/")) window.location.assign(route);
      });
    }
  }

  permissionState(): NotificationPermission | "unsupported" {
    return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  }

  isRegistered(): boolean { return this.registered; }

  async enableNotifications(): Promise<WebPushEnableResult> {
    try {
      if (!this.available() || !(await isSupported())) return "unsupported";
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission === "denied") return "denied";
      if (permission !== "granted") return "error";
      return (await this.syncIfPermissionGranted()) ? "enabled" : "error";
    } catch {
      return "error";
    }
  }

  async syncIfPermissionGranted(): Promise<boolean> {
    if (!this.available() || Notification.permission !== "granted" || !(await isSupported())) return false;
    if (this.registerInFlight) return this.registerInFlight;
    this.registerInFlight = this.registerCurrentInstallation().finally(() => { this.registerInFlight = null; });
    return this.registerInFlight;
  }

  async revokeForLogout(): Promise<void> {
    const fid = localStorage.getItem(WEB_FID_KEY)?.trim() || null;
    try {
      if (fid) await this.revokeBackend(fid);
      const messaging = await this.messaging();
      if (messaging) await unregister(messaging).catch(() => undefined);
    } finally {
      localStorage.removeItem(WEB_FID_KEY);
      this.registered = false;
    }
  }

  private async registerCurrentInstallation(): Promise<boolean> {
    const messaging = await this.messaging();
    if (!messaging) return false;
    this.bindListeners(messaging);
    const worker = await this.messagingWorker();
    const registrationResult = new Promise<boolean>((resolve) => {
      this.registrationResolver = resolve;
      this.registrationTimeout = setTimeout(() => this.completeRegistration(this.registered), 5000);
    });
    try {
      await register(messaging, { vapidKey: VELORA_FIREBASE_WEB_VAPID_KEY, serviceWorkerRegistration: worker });
      return await registrationResult;
    } catch {
      this.completeRegistration(false);
      return false;
    }
  }

  private bindListeners(messaging: Messaging): void {
    if (this.listenersBound) return;
    this.listenersBound = true;
    onRegistered(messaging, (fid) => { void this.syncFid(fid).then((ok) => this.completeRegistration(ok)); });
    onUnregistered(messaging, (fid) => {
      if (localStorage.getItem(WEB_FID_KEY) === fid) localStorage.removeItem(WEB_FID_KEY);
      this.registered = false;
      void this.revokeBackend(fid).catch(() => undefined);
    });
    onMessage(messaging, (payload) => this.showForeground(payload));
  }

  private async syncFid(rawFid: string): Promise<boolean> {
    const fid = rawFid.trim();
    if (!fid) return false;
    const previous = localStorage.getItem(WEB_FID_KEY)?.trim();
    if (previous && previous !== fid) await this.revokeBackend(previous).catch(() => undefined);
    try {
      await apiRequest<PushInstallationResponse>("/api/push/installations", {
        method: "PUT",
        body: jsonBody({ installationId: fid, platform: "WEB", deviceLabel: navigator.userAgent.slice(0, 160) }),
      });
      localStorage.setItem(WEB_FID_KEY, fid);
      this.registered = true;
      return true;
    } catch {
      this.registered = false;
      return false;
    }
  }

  private async revokeBackend(fid: string): Promise<void> {
    try {
      await apiRequest<void>(`/api/push/installations?platform=WEB&installationId=${encodeURIComponent(fid)}`, { method: "DELETE" });
    } catch {
      // Revocation is best effort; logout must not be blocked by a network outage.
    }
  }

  private completeRegistration(value: boolean): void {
    if (this.registrationTimeout) clearTimeout(this.registrationTimeout);
    this.registrationTimeout = null;
    const resolve = this.registrationResolver;
    this.registrationResolver = null;
    resolve?.(value);
  }

  private showForeground(payload: MessagePayload): void {
    if (Notification.permission !== "granted") return;
    const data = payload.data ?? {};
    const title = data.title ?? payload.notification?.title ?? "VÉLORA";
    const body = data.body ?? payload.notification?.body ?? "Hay una actualización disponible.";
    try {
      const notification = new Notification(title, { body, data });
      notification.onclick = () => {
        const route = data.route;
        if (route?.startsWith("/")) window.location.assign(route);
        window.focus();
        notification.close();
      };
    } catch {
      // Foreground notification rendering must never break the application.
    }
  }

  private async messaging(): Promise<Messaging | null> {
    if (!this.messagingPromise) {
      this.messagingPromise = (async () => {
        if (!this.available() || !(await isSupported())) return null;
        const app = getApps()[0] ?? initializeApp(VELORA_FIREBASE_WEB_CONFIG);
        return getMessaging(app);
      })();
    }
    return this.messagingPromise;
  }

  private async messagingWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.workerPromise) this.workerPromise = navigator.serviceWorker.register(VELORA_FIREBASE_MESSAGING_SW_URL, { scope: VELORA_FIREBASE_MESSAGING_SW_SCOPE });
    return this.workerPromise;
  }

  private available(): boolean {
    return typeof window !== "undefined" && typeof Notification !== "undefined" && "serviceWorker" in navigator;
  }
}

export const webPush = new WebPushManager();
