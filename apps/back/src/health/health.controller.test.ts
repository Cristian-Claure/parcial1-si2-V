import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import type { DatabaseService } from "../database/database.service.js";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("reports UP with db UP when the ping succeeds", async () => {
    const database = { ping: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseService;
    const result = await new HealthController(database).health();
    expect(result).toMatchObject({ status: "UP", db: "UP" });
  });

  it("throws 503 when the db ping fails", async () => {
    const database = { ping: vi.fn().mockRejectedValue(new Error("connection refused")) } as unknown as DatabaseService;
    await expect(new HealthController(database).health()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
