import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CatalogAssetsService,
} from "./catalog-assets.service.js";

const userId =
  "50000000-0000-4000-8000-000000000001";

const companyId =
  "10000000-0000-0000-0000-000000000001";

const productId =
  "51000000-0000-4000-8000-000000000001";

const imageId =
  "52000000-0000-4000-8000-000000000001";

const storageKey =
  "53000000-0000-4000-8000-000000000001.png";

const expectedRelativeUrl =
  `/api/catalog/assets/${storageKey}`;

describe(
  "CatalogAssetsService managed asset URLs",
  () => {
    it(
      "persists a managed asset URL without embedding the backend host",
      async () => {
        const createManagedImage =
          vi.fn(
            async (
              _productId: string,
              variantId: string | null,
              imageUrl: string,
              altText: string | null,
              purpose: "GALLERY" | "TRY_ON_GARMENT",
              sortOrder: number,
              primary: boolean,
            ) => ({
              id:
                imageId,
              variantId,
              imageUrl,
              altText,
              purpose,
              sortOrder,
              primary,
            }),
          );

        const repository = {
          findProduct:
            vi.fn()
              .mockResolvedValue({
                id:
                  productId,
                companyId,
              }),
          createManagedImage,
        };

        const storage = {
          store:
            vi.fn()
              .mockResolvedValue({
                storageKey,
                contentType:
                  "image/png",
                sizeBytes:
                  8,
              }),
          delete:
            vi.fn()
              .mockResolvedValue(
                undefined,
              ),
        };

        const access = {
          resolve:
            vi.fn()
              .mockResolvedValue({
                userId,
                role:
                  "ADMIN",
                storeId:
                  null,
                companyId:
                  null,
              }),
        };

        const config = {
          value: {
            VELORA_PUBLIC_BACKEND_URL:
              "http://localhost:8080",
          },
        };

        const service =
          new CatalogAssetsService(
            repository as never,
            storage as never,
            access as never,
            config as never,
          );

        const result =
          await service.upload(
            {
              userId,
              role:
                "ADMIN",
            } as never,
            productId,
            {
              purpose:
                "GALLERY",
              sortOrder:
                "0",
              primary:
                "false",
            },
            {
              buffer:
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
              mimetype:
                "image/png",
              size:
                8,
            },
          );

        expect(
          createManagedImage,
        ).toHaveBeenCalledTimes(
          1,
        );

        const persistedUrl =
          createManagedImage
            .mock
            .calls[0]?.[2];

        expect(
          persistedUrl,
        ).toBe(
          expectedRelativeUrl,
        );

        expect(
          result.imageUrl,
        ).toBe(
          expectedRelativeUrl,
        );
      },
    );
  },
);