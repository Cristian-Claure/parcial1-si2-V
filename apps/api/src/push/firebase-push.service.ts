import { createSign } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { PushRepository, type PushDeliveryTarget } from "./push.repository.js";

export interface CustomerPushMessage {
  title: string;
  body: string;
  type: string;
  entityId?: string;
  route?: string;
}

export interface PushDeliverySummary {
  enabled: boolean;
  registeredInstallations: number;
  sent: number;
  failed: number;
}

@Injectable()
export class FirebasePushService {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: RuntimeConfigService, private readonly repository: PushRepository) {}

  async sendToUser(userId: string, message: CustomerPushMessage): Promise<PushDeliverySummary> {
    const targets = await this.repository.activeForUser(userId);
    if (!this.providerReady()) return { enabled: false, registeredInstallations: targets.length, sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        await this.send(target, message);
        sent += 1;
      } catch (error) {
        failed += 1;
        if (this.isUnregistered(error)) await this.repository.revokeById(target.id);
      }
    }
    return { enabled: true, registeredInstallations: targets.length, sent, failed };
  }

  private providerReady(): boolean {
    const value = this.config.value;
    return value.VELORA_PUSH_FIREBASE_ENABLED && Boolean(value.FIREBASE_PROJECT_ID && value.FIREBASE_CLIENT_EMAIL && value.FIREBASE_PRIVATE_KEY);
  }

  private async send(target: PushDeliveryTarget, push: CustomerPushMessage): Promise<void> {
    const projectId = this.config.value.FIREBASE_PROJECT_ID;
    if (!projectId) return;
    const token = await this.googleAccessToken();
    const data: Record<string, string> = { title: push.title, body: push.body, type: push.type };
    if (push.entityId) data.entityId = push.entityId;
    if (push.route) data.route = push.route;

    const targetField: { fid: string } | { token: string } = target.platform === "WEB"
      ? { fid: target.installationId }
      : { token: target.installationId };

    const android = target.platform === "ANDROID"
      ? {
          priority: "HIGH" as const,
          notification: {
            channel_id: "velora_customer_updates_v2",
          },
        }
      : undefined;
    const notification = target.platform === "ANDROID"
      ? {
          title: push.title,
          body: push.body,
        }
      : undefined;
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { ...targetField, data, ...(android ? { android } : {}), ...(notification ? { notification } : {}) } }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`FCM_${response.status}:${detail.slice(0, 500)}`);
    }
  }

  private async googleAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt > now + 60) return this.accessToken.value;

    const email = this.config.value.FIREBASE_CLIENT_EMAIL;
    const rawKey = this.config.value.FIREBASE_PRIVATE_KEY;
    if (!email || !rawKey) throw new Error("Firebase service-account credentials are incomplete.");
    const privateKey = rawKey.replace(/\\n/g, "\n");
    const header = this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = this.base64Url(JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));
    const unsigned = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;

    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) throw new Error(`FIREBASE_OAUTH_${response.status}`);
    const result = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof result.access_token !== "string") throw new Error("Firebase OAuth response did not include access_token.");
    const expiresIn = typeof result.expires_in === "number" ? result.expires_in : 3600;
    this.accessToken = { value: result.access_token, expiresAt: now + expiresIn };
    return result.access_token;
  }

  private base64Url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  private isUnregistered(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toUpperCase() : "";
    return message.includes("UNREGISTERED") || message.includes("NOT_FOUND") || message.startsWith("FCM_404:");
  }
}
