import * as Device from "expo-device";
import { isRunningInExpoGo } from "expo";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type * as ExpoNotifications from "expo-notifications";
import type { PushInstallationResponse } from "@velora/contracts";
import { apiRequest, jsonBody } from "../api/apiClient";

const INSTALLATION_KEY = "velora_push_installation_id";
const CHANNEL_ID = "velora_customer_updates_v2";

type EnableResult = "enabled" | "denied" | "unsupported" | "error";

// expo-notifications registers a push-token listener as a side effect of merely being
// imported (DevicePushTokenAutoRegistration.fx), which throws synchronously on Android
// under Expo Go (SDK 53+ removed remote push there) -- no try/catch around our own calls
// can catch that, since it fires from the package's own top-level module code. Load it
// lazily via dynamic import, and never at all under Expo Go, so the import itself never
// runs there. Push still registers/loads normally in a real dev build.
let notificationsModulePromise: Promise<typeof ExpoNotifications> | null = null;

function loadNotifications(): Promise<typeof ExpoNotifications> {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications");
  }
  return notificationsModulePromise;
}

if (!isRunningInExpoGo()) {
  void loadNotifications().then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  });
}

class MobilePushManager {
  async enableNotifications(): Promise<EnableResult> {
    if (!this.available()) return "unsupported";
    const Notifications = await loadNotifications();
    try {
      await this.ensureAndroidChannel(Notifications);
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return "denied";
      return (await this.syncCurrentInstallation(Notifications)) ? "enabled" : "error";
    } catch {
      return "error";
    }
  }

  async syncIfPermissionGranted(): Promise<boolean> {
    if (!this.available()) return false;
    const Notifications = await loadNotifications();
    try {
      await this.ensureAndroidChannel(Notifications);
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") return false;
      return this.syncCurrentInstallation(Notifications);
    } catch {
      return false;
    }
  }

  startLifecycleListeners(): () => void {
    if (!this.available()) return () => undefined;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void loadNotifications()
      .then((Notifications) => {
        if (cancelled) return;

        const tokenSubscription = Notifications.addPushTokenListener((token) => {
          void this.syncNativeToken(token).catch(() => undefined);
        });
        const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          this.navigateFromData(response.notification.request.content.data ?? {});
        });

        void Notifications.getLastNotificationResponseAsync()
          .then((response) => {
            if (response) this.navigateFromData(response.notification.request.content.data ?? {});
          })
          .catch(() => undefined);

        cleanup = () => {
          tokenSubscription.remove();
          responseSubscription.remove();
        };
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }

  async revokeForLogout(): Promise<void> {
    const installationId = await SecureStore.getItemAsync(INSTALLATION_KEY);
    try {
      if (installationId) {
        await apiRequest<void>(`/api/push/installations?platform=ANDROID&installationId=${encodeURIComponent(installationId)}`, { method: "DELETE" });
      }
    } catch {
      // Best effort: logout must still complete while offline.
    }
    await SecureStore.deleteItemAsync(INSTALLATION_KEY);
  }

  private async syncCurrentInstallation(Notifications: typeof ExpoNotifications): Promise<boolean> {
    const token = await Notifications.getDevicePushTokenAsync();
    return this.syncNativeToken(token);
  }

  private async syncNativeToken(token: ExpoNotifications.DevicePushToken): Promise<boolean> {
    const installationId = typeof token.data === "string" ? token.data.trim() : "";
    if (!installationId) return false;

    const previous = await SecureStore.getItemAsync(INSTALLATION_KEY);
    if (previous && previous !== installationId) {
      await apiRequest<void>(`/api/push/installations?platform=ANDROID&installationId=${encodeURIComponent(previous)}`, { method: "DELETE" }).catch(() => undefined);
    }

    const label = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ").slice(0, 160) || "Android";
    await apiRequest<PushInstallationResponse>("/api/push/installations", {
      method: "PUT",
      body: jsonBody({ installationId, platform: "ANDROID", deviceLabel: label }),
    });
    await SecureStore.setItemAsync(INSTALLATION_KEY, installationId);
    return true;
  }

  private navigateFromData(data: Record<string, unknown>): void {
    const route = typeof data.route === "string" ? data.route : "";
    if (route === "/mis-pedidos" || route === "/orders") {
      router.push("/orders" as never);
    }
  }

  private async ensureAndroidChannel(Notifications: typeof ExpoNotifications): Promise<void> {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Actualizaciones de pedidos",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  private available(): boolean {
    return Platform.OS === "android" && Device.isDevice && !isRunningInExpoGo();
  }
}

export const mobilePush = new MobilePushManager();
