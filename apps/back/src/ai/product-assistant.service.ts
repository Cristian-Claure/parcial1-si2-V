import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  eq,
  inArray,
} from "drizzle-orm";

import {
  z,
} from "zod";

import type {
  ProductAssistantRequest,
  ProductAssistantResponse,
} from "@velora/contracts";

import {
  categories,
  companies,
  products,
  productVariants,
} from "@velora/database";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  DatabaseService,
} from "../database/database.service.js";

const modelOutputSchema =
  z.object({
    reply:
      z
        .string()
        .trim()
        .min(1)
        .max(1400),
    recommendations:
      z
        .array(
          z.object({
            productId:
              z.string(),
            reason:
              z
                .string()
                .trim()
                .min(1)
                .max(420),
            variantIds:
              z
                .array(
                  z.string(),
                )
                .max(8),
          }),
        )
        .max(4),
  });

interface CatalogProductForAi {
  id: string;
  name: string;
  brand: string;
  categoryName: string;
  description:
    string | null;
}

interface CatalogVariantForAi {
  id: string;
  productId: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  currency: string;
}

@Injectable()
export class ProductAssistantService {
  constructor(
    private readonly database:
      DatabaseService,
    private readonly access:
      AccessContextService,
    private readonly config:
      RuntimeConfigService,
  ) {}

  async recommend(
    principal:
      AuthPrincipal,
    request:
      ProductAssistantRequest,
  ): Promise<ProductAssistantResponse> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role !==
      "CUSTOMER"
    ) {
      throw new ApiHttpError(
        403,
        "El asistente de productos está disponible únicamente para clientes.",
      );
    }

    const apiKey =
      this.config.value
        .OPENAI_API_KEY
        ?.trim();

    if (
      !apiKey
    ) {
      throw new ApiHttpError(
        503,
        "El asistente de productos no está configurado.",
      );
    }

    const company =
      await this.database.db
        .select({
          id:
            companies.id,
          name:
            companies.name,
        })
        .from(
          companies,
        )
        .where(
          and(
            eq(
              companies.id,
              request.companyId,
            ),
            eq(
              companies.active,
              true,
            ),
          ),
        )
        .limit(1);

    const companyRow =
      company[0];

    if (
      !companyRow
    ) {
      throw new ApiHttpError(
        404,
        "Compañía no encontrada.",
      );
    }

    const catalogProducts =
      await this.database.db
        .select({
          id:
            products.id,
          name:
            products.name,
          brand:
            products.brand,
          categoryName:
            categories.name,
          description:
            products.description,
        })
        .from(
          products,
        )
        .innerJoin(
          categories,
          and(
            eq(
              products.companyId,
              categories.companyId,
            ),
            eq(
              products.categoryId,
              categories.id,
            ),
          ),
        )
        .where(
          and(
            eq(
              products.companyId,
              request.companyId,
            ),
            eq(
              products.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(
          this.config.value
            .VELORA_AI_MAX_CATALOG_PRODUCTS,
        );

    const productIds =
      catalogProducts.map(
        (product) =>
          product.id,
      );

    const catalogVariants:
      CatalogVariantForAi[] =
        productIds.length === 0
          ? []
          : await this.database.db
              .select({
                id:
                  productVariants.id,
                productId:
                  productVariants.productId,
                sku:
                  productVariants.sku,
                size:
                  productVariants.size,
                color:
                  productVariants.color,
                price:
                  productVariants.price,
                currency:
                  productVariants.currency,
              })
              .from(
                productVariants,
              )
              .where(
                and(
                  inArray(
                    productVariants.productId,
                    productIds,
                  ),
                  eq(
                    productVariants.active,
                    true,
                  ),
                ),
              );

    const raw =
      await this.openAiRequest(
        apiKey,
        companyRow.name,
        catalogProducts,
        catalogVariants,
        request,
      );

    const parsed =
      modelOutputSchema
        .safeParse(
          raw,
        );

    if (
      !parsed.success
    ) {
      throw new ApiHttpError(
        502,
        "El asistente devolvió una respuesta estructurada inválida.",
      );
    }

    const variantsByProduct =
      new Map<
        string,
        Set<string>
      >();

    for (
      const variant of
        catalogVariants
    ) {
      const current =
        variantsByProduct
          .get(
            variant.productId,
          ) ??
        new Set<string>();

      current.add(
        variant.id,
      );
      variantsByProduct
        .set(
          variant.productId,
          current,
        );
    }

    const validProducts =
      new Set(
        catalogProducts.map(
          (product) =>
            product.id,
        ),
      );

    const seen =
      new Set<string>();
    const recommendations =
      parsed.data
        .recommendations
        .filter(
          (recommendation) => {
            if (
              !validProducts.has(
                recommendation.productId,
              ) ||
              seen.has(
                recommendation.productId,
              )
            ) {
              return false;
            }

            seen.add(
              recommendation.productId,
            );

            return true;
          },
        )
        .map(
          (recommendation) => {
            const validVariants =
              variantsByProduct
                .get(
                  recommendation.productId,
                ) ??
              new Set<string>();

            return {
              productId:
                recommendation.productId,
              reason:
                recommendation.reason,
              variantIds:
                recommendation.variantIds
                  .filter(
                    (variantId) =>
                      validVariants.has(
                        variantId,
                      ),
                  ),
            };
          },
        );

    return {
      reply:
        parsed.data.reply,
      recommendations,
      model:
        this.config.value
          .VELORA_AI_MODEL,
    };
  }

  private async openAiRequest(
    apiKey: string,
    companyName: string,
    catalogProducts:
      CatalogProductForAi[],
    catalogVariants:
      CatalogVariantForAi[],
    request:
      ProductAssistantRequest,
  ): Promise<unknown> {
    const catalog =
      catalogProducts.map(
        (product) => ({
          ...product,
          variants:
            catalogVariants
              .filter(
                (variant) =>
                  variant.productId ===
                  product.id,
              )
              .map(
                (variant) => ({
                  id:
                    variant.id,
                  sku:
                    variant.sku,
                  size:
                    variant.size,
                  color:
                    variant.color,
                  price:
                    Number(
                      variant.price,
                    ),
                  currency:
                    variant.currency,
                }),
              ),
        }),
      );

    const messages:
      Array<{
        role:
          | "system"
          | "user"
          | "assistant";
        content: string;
      }> = [
        {
          role:
            "system",
          content:
            [
              `Eres VÉLORA AI, asesora digital de producto y estilo de ${companyName}.`,
              "Ayuda según ocasión, estilo, color, talla, presupuesto, combinación y preferencias.",
              "Sólo puedes recomendar productos presentes literalmente en el catálogo JSON entregado.",
              "productId debe ser un id exacto del catálogo.",
              "variantIds sólo puede contener ids de variantes activas del mismo producto.",
              "Nunca inventes nombre, producto, variante, SKU, precio, talla, color o composición.",
              "Nunca afirmes stock físico por sucursal; una variante activa no equivale a stock.",
              "Si no existe una opción adecuada, dilo con elegancia y devuelve recommendations=[].",
              "Si el usuario indica presupuesto, usa exclusivamente precios del catálogo entregado.",
              "Recomienda máximo cuatro productos y explica brevemente por qué encajan.",
              "Habla en español con tono elegante, natural, cálido y profesional.",
              `CATALOGO=${JSON.stringify(catalog)}`,
            ].join(
              "\n",
            ),
        },
        ...(
          request.history ??
          []
        ).map(
          (item) => ({
            role:
              item.role,
            content:
              item.content
                .slice(
                  0,
                  1200,
                ),
          }),
        ),
        {
          role:
            "user",
          content:
            request.message,
        },
      ];

    const outputSchema = {
      type:
        "object",
      additionalProperties:
        false,
      properties: {
        reply: {
          type:
            "string",
        },
        recommendations: {
          type:
            "array",
          items: {
            type:
              "object",
            additionalProperties:
              false,
            properties: {
              productId: {
                type:
                  "string",
              },
              reason: {
                type:
                  "string",
              },
              variantIds: {
                type:
                  "array",
                items: {
                  type:
                    "string",
                },
              },
            },
            required: [
              "productId",
              "reason",
              "variantIds",
            ],
          },
        },
      },
      required: [
        "reply",
        "recommendations",
      ],
    };

    let response:
      Response;

    try {
      response =
        await fetch(
          `${this.config.value.VELORA_OPENAI_BASE_URL.replace(/\/$/, "")}/responses`,
          {
            method:
              "POST",
            headers: {
              "Authorization":
                `Bearer ${apiKey}`,
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                model:
                  this.config.value
                    .VELORA_AI_MODEL,
                input:
                  messages,
                text: {
                  format: {
                    type:
                      "json_schema",
                    name:
                      "velora_product_assistant",
                    strict:
                      true,
                    schema:
                      outputSchema,
                  },
                },
                max_output_tokens:
                  900,
              }),
            signal:
              AbortSignal.timeout(
                45_000,
              ),
          },
        );
    }
    catch {
      throw new ApiHttpError(
        503,
        "El asistente de productos no está disponible.",
      );
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI no pudo completar la recomendación.",
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response
          .json();
    }
    catch {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una respuesta inválida.",
      );
    }

    const text =
      this.responseText(
        payload,
      );

    if (
      !text
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una respuesta vacía.",
      );
    }

    try {
      return JSON.parse(
        text,
      ) as unknown;
    }
    catch {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió JSON estructurado inválido.",
      );
    }
  }

  private responseText(
    payload: unknown,
  ): string | null {
    const record =
      this.asRecord(
        payload,
      );

    if (
      typeof record.output_text ===
        "string" &&
      record.output_text.trim() !==
        ""
    ) {
      return record.output_text;
    }

    if (
      !Array.isArray(
        record.output,
      )
    ) {
      return null;
    }

    for (
      const item of
        record.output
    ) {
      const output =
        this.asRecord(
          item,
        );

      if (
        !Array.isArray(
          output.content,
        )
      ) {
        continue;
      }

      for (
        const contentItem of
          output.content
      ) {
        const content =
          this.asRecord(
            contentItem,
          );

        if (
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string" &&
          content.text.trim() !==
            ""
        ) {
          return content.text;
        }
      }
    }

    return null;
  }

  private asRecord(
    value: unknown,
  ): Record<string, unknown> {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(
        value,
      )
    ) {
      return value as Record<
        string,
        unknown
      >;
    }

    return {};
  }
}
