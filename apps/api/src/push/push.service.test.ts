import { describe, expect, it, vi } from "vitest";
import type { AccessContextService } from "../common/authz/access-context.service.js";
import { PushInstallationService } from "./push-installation.service.js";
import type { PushRepository } from "./push.repository.js";

const principal = { userId: "30000000-0000-4000-8000-000000000001", email: "customer@velora.test", role: "CUSTOMER" as const, name: "Customer" };

describe("PushInstallationService", () => {
  it("registers against the authenticated customer and reuses legacy installation semantics", async () => {
    const response = { id: "70000000-0000-4000-8000-000000000001", installationId: "fid-web-1", platform: "WEB" as const, deviceLabel: "Chrome", active: true, lastSeenAt: "2026-09-10T12:00:00.000Z", revokedAt: null, createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-10T12:00:00.000Z" };
    const repository = { isActiveCustomer: vi.fn().mockResolvedValue(true), register: vi.fn().mockResolvedValue(response) } as unknown as PushRepository;
    const access = { resolve: vi.fn().mockResolvedValue({ userId: principal.userId, role: "CUSTOMER", storeId: null, companyId: null }) } as unknown as AccessContextService;
    const service = new PushInstallationService(repository, access);
    await expect(service.register(principal, { installationId: " fid-web-1 ", platform: "WEB", deviceLabel: " Chrome " })).resolves.toEqual(response);
    expect(repository.register).toHaveBeenCalledWith(principal.userId, expect.objectContaining({ installationId: "fid-web-1", deviceLabel: "Chrome" }));
  });

  it("revocation is idempotent and scoped to the authenticated customer", async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const repository = { revoke } as unknown as PushRepository;
    const access = { resolve: vi.fn().mockResolvedValue({ userId: principal.userId, role: "CUSTOMER", storeId: null, companyId: null }) } as unknown as AccessContextService;
    const service = new PushInstallationService(repository, access);
    await service.revoke(principal, { platform: "ANDROID", installationId: "native-token" });
    expect(revoke).toHaveBeenCalledWith(principal.userId, "ANDROID", "native-token");
  });
});
