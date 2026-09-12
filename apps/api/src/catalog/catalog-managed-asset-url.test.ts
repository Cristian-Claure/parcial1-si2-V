import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CatalogService,
} from "./catalog.service.js";

describe(
  "CatalogService managed asset public URL",
  () => {
    it(
      "rebuilds a managed asset URL using the runtime backend URL",
      () => {
        const service =
          new CatalogService(
            {} as never,
            {} as never,
            {
              value: {
                VELORA_PUBLIC_BACKEND_URL:
                  "http://192.168.251.65:8080",
              },
            } as never,
          );

        const response =
          (
            service as unknown as {
              imageResponse:
                (image: {
                  id: string;
                  variantId: string | null;
                  imageUrl: string;
                  altText: string | null;
                  purpose: "GALLERY";
                  sortOrder: number;
                  primary: boolean;
                  storageKey: string | null;
                }) => {
                  imageUrl: string;
                };
            }
          ).imageResponse({
            id:
              "52000000-0000-4000-8000-000000000002",

            variantId:
              null,

            imageUrl:
              "http://localhost:8080/api/catalog/assets/legacy.png",

            altText:
              null,

            purpose:
              "GALLERY",

            sortOrder:
              0,

            primary:
              true,

            storageKey:
              "53000000-0000-4000-8000-000000000002.png",
          });

        expect(
          response.imageUrl,
        ).toBe(
          "http://192.168.251.65:8080/api/catalog/assets/53000000-0000-4000-8000-000000000002.png",
        );
      },
    );
  },
);