import { describe, expect, it } from "vitest";
import { dbIdSchema } from "./shared.js";

describe("dbIdSchema", () => {
  it("accepts a legacy UUID whose variant nibble isn't RFC 4122-compliant", () => {
    // Real product_variants.id that caused the original 400 (VLR-ABR05-03).
    const legacyId = "f144e428-751b-32c7-4fc5-e0a0e9491356";
    expect(dbIdSchema.safeParse(legacyId).success).toBe(true);
  });

  it("accepts a standard RFC 4122 v4 UUID", () => {
    const v4Id = "123e4567-e89b-42d3-a456-426614174000";
    expect(dbIdSchema.safeParse(v4Id).success).toBe(true);
  });

  it("rejects a string that isn't UUID-shaped at all", () => {
    expect(dbIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
