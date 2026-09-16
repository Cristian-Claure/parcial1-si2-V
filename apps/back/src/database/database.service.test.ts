import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@velora/database", () => ({
  createDatabase: vi.fn(() => ({
    db: {},
    pool: { query: queryMock },
  })),
}));

import type { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DatabaseService } from "./database.service.js";

function configService(): RuntimeConfigService {
  return { value: { DATABASE_URL: "postgres://user:pass@localhost:5432/velora" } } as unknown as RuntimeConfigService;
}

describe("DatabaseService#ping", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("resolves when the underlying connection query succeeds", async () => {
    queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const service = new DatabaseService(configService());

    await expect(service.ping()).resolves.toBeUndefined();

    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
  });

  it("rejects when the underlying connection query fails", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));
    const service = new DatabaseService(configService());

    await expect(service.ping()).rejects.toThrow("connection refused");
  });
});
