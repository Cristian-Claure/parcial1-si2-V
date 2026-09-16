import {
  describe,
  expect,
  it,
} from "vitest";

import {
  detectImageContentType,
} from "../common/media/image-validation.js";

import {
  normalizeProviderStatus,
} from "./try-on-provider.service.js";

describe(
  "N9 Try-On rules",
  () => {
    it(
      "detects PNG, JPEG and WEBP by binary signature",
      () => {
        expect(
          detectImageContentType(
            Buffer.from([
              0x89,
              0x50,
              0x4e,
              0x47,
              0x0d,
              0x0a,
              0x1a,
              0x0a,
            ]),
            "PNG",
          ),
        ).toBe(
          "image/png",
        );

        expect(
          detectImageContentType(
            Buffer.from([
              0xff,
              0xd8,
              0xff,
            ]),
            "JPEG",
          ),
        ).toBe(
          "image/jpeg",
        );

        expect(
          detectImageContentType(
            Buffer.from(
              "RIFF0000WEBP",
              "ascii",
            ),
            "WEBP",
          ),
        ).toBe(
          "image/webp",
        );
      },
    );

    it(
      "normalizes LOCAL and Replicate states",
      () => {
        expect(
          normalizeProviderStatus(
            "starting",
          ),
        ).toBe(
          "QUEUED",
        );
        expect(
          normalizeProviderStatus(
            "running",
          ),
        ).toBe(
          "PROCESSING",
        );
        expect(
          normalizeProviderStatus(
            "completed",
          ),
        ).toBe(
          "SUCCEEDED",
        );
        expect(
          normalizeProviderStatus(
            "canceled",
          ),
        ).toBe(
          "CANCELLED",
        );
        expect(
          normalizeProviderStatus(
            "error",
          ),
        ).toBe(
          "FAILED",
        );
      },
    );
  },
);
