import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { PushInstallationResponse } from "@velora/contracts";
import { apiRequest, jsonBody } from "../api/apiClient";

const INSTALLATION_KEY = "velora_push_installation_id";
const CHANNEL_ID = "velora_customer_updates_v2";

type EnableResult = "enabled" | "denied" | "unsupported" | "error";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class MobilePushManager {
  async enableNotifications(): Promise<EnableResult> {
    if (!this.available()) return "unsupported";
    try {
      await this.ensureAndroidChannel();
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return "denied";
      return (await this.syncCurrentInstallation()) ? "enabled" : "error";
    } catch {
      return "error";
    }
  }

  async syncIfPermissionGranted(): Promise<boolean> {
    if (!this.available()) return false;
    try {
      await this.ensureAndroidChannel();
      const permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") return false;
      return this.syncCurrentInstallation();
    } catch {
      return false;
    }
  }

  startLifecycleListeners(): () => void {
    if (!this.available()) return () => undefined;

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

    return () => {
      tokenSubscription.remove();
      responseSubscription.remove();
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

  private async syncCurrentInstallation(): Promise<boolean> {
    const token = await Notifications.getDevicePushTokenAsync();
    return this.syncNativeToken(token);
  }

  private async syncNativeToken(token: Notifications.DevicePushToken): Promise<boolean> {
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

  private async ensureAndroidChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Actualizaciones de pedidos",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  private available(): boolean {
    return Platform.OS === "android" && Device.isDevice;
  }
}

export const mobilePush = new MobilePushManager();
