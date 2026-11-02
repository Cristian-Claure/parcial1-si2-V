import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPwaDataCaches, PWA_DATA_CACHES } from "./pwaCaches";
import config from "../../vite.config.ts?raw";

afterEach(() => { vi.unstubAllGlobals(); });

describe("clearPwaDataCaches", () => {
  it("borra los cachés de datos del SW y conserva el precaché del shell", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", { delete: vi.fn(async (name: string) => { deleted.push(name); return true; }) });
    await clearPwaDataCaches();
    expect(deleted.sort()).toEqual([...PWA_DATA_CACHES].sort());
    expect(deleted.some((name) => name.startsWith("workbox-precache"))).toBe(false);
  });

  it("no falla sin Cache Storage", async () => {
    vi.stubGlobal("caches", { delete: vi.fn(async () => { throw new Error("SecurityError"); }) });
    await expect(clearPwaDataCaches()).resolves.toBeUndefined();
  });

  it("los nombres coinciden con runtimeCaching de vite.config.ts y el SW excluye peticiones autenticadas", () => {
    for (const name of PWA_DATA_CACHES) expect(config).toContain(`cacheName: "${name}"`);
    expect(config.match(/!request\.headers\.has\("Authorization"\)/g)?.length).toBe(2);
  });
});
