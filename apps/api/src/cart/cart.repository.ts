import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CartItemResponse,
  CartResponse,
} from "@velora/contracts";

import {
  productVariants,
  products,
  shoppingCartItems,
  shoppingCarts,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

interface VariantSaleRecord {
  id:
    string;

  variantActive:
    boolean;

  productActive:
    boolean;
}

export type AddItemResult =
  | {
      kind:
        "OK";

      cart:
        CartResponse;
    }
  | {
      kind:
        "MAX_EXCEEDED";
    };

export type UpdateItemResult =
  | {
      kind:
        "OK";

      cart:
        CartResponse;
    }
  | {
      kind:
        "NOT_FOUND";
    }
  | {
      kind:
        "VARIANT_UNAVAILABLE";
    };

export type RemoveItemResult =
  | {
      kind:
        "OK";

      cart:
        CartResponse;
    }
  | {
      kind:
        "NOT_FOUND";
    };

@Injectable()
export class CartRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async findVariantForSale(
    variantId: string,
  ): Promise<VariantSaleRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,

          variantActive:
            productVariants.active,

          productActive:
            sql<boolean>`
              ${products.status}
              =
              'ACTIVE'
            `,
        })
        .from(
          productVariants,
        )
        .innerJoin(
          products,
          eq(
            productVariants.productId,
            products.id,
          ),
        )
        .where(
          eq(
            productVariants.id,
            variantId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async getActiveCart(
    userId: string,
  ): Promise<CartResponse> {
    const carts =
      await this.database.db
        .select({
          id:
            shoppingCarts.id,
        })
        .from(
          shoppingCarts,
        )
        .where(
          and(
            eq(
              shoppingCarts.userId,
              userId,
            ),
            eq(
              shoppingCarts.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1);

    const cart =
      carts[0];

    if (!cart) {
      return this.emptyCart();
    }

    return this.response(
      cart.id,
    );
  }

  async addItem(
    userId: string,
    variantId: string,
    quantity: number,
  ): Promise<AddItemResult> {
    const result =
      await this.database.db
        .transaction(
          async (tx) => {
            await tx.execute(
              sql`
                select id
                from app_users
                where id =
                  ${userId}::uuid
                for update
              `,
            );

            const active =
              await tx
                .select({
                  id:
                    shoppingCarts.id,
                })
                .from(
                  shoppingCarts,
                )
                .where(
                  and(
                    eq(
                      shoppingCarts.userId,
                      userId,
                    ),
                    eq(
                      shoppingCarts.status,
                      "ACTIVE",
                    ),
                  ),
                )
                .limit(1);

            let cartId =
              active[0]?.id;

            if (!cartId) {
              cartId =
                randomUUID();

              const now =
                new Date();

              await tx
                .insert(
                  shoppingCarts,
                )
                .values({
                  id:
                    cartId,

                  userId,

                  status:
                    "ACTIVE",

                  createdAt:
                    now,

                  updatedAt:
                    now,
                });
            }

            const current =
              await tx
                .select({
                  id:
                    shoppingCartItems.id,

                  quantity:
                    shoppingCartItems.quantity,
                })
                .from(
                  shoppingCartItems,
                )
                .where(
                  and(
                    eq(
                      shoppingCartItems.cartId,
                      cartId,
                    ),
                    eq(
                      shoppingCartItems.variantId,
                      variantId,
                    ),
                  ),
                )
                .limit(1);

            const currentItem =
              current[0];

            const newQuantity =
              (
                currentItem?.quantity ??
                0
              ) +
              quantity;

            if (
              newQuantity >
              99
            ) {
              return {
                kind:
                  "MAX_EXCEEDED" as const,
              };
            }

            const now =
              new Date();

            if (currentItem) {
              await tx
                .update(
                  shoppingCartItems,
                )
                .set({
                  quantity:
                    newQuantity,

                  updatedAt:
                    now,
                })
                .where(
                  eq(
                    shoppingCartItems.id,
                    currentItem.id,
                  ),
                );
            }
            else {
              await tx
                .insert(
                  shoppingCartItems,
                )
                .values({
                  id:
                    randomUUID(),

                  cartId,

                  variantId,

                  quantity:
                    newQuantity,

                  createdAt:
                    now,

                  updatedAt:
                    now,
                });
            }

            await tx
              .update(
                shoppingCarts,
              )
              .set({
                updatedAt:
                  now,
              })
              .where(
                eq(
                  shoppingCarts.id,
                  cartId,
                ),
              );

            return {
              kind:
                "OK" as const,
            };
          },
        );

    if (
      result.kind ===
      "MAX_EXCEEDED"
    ) {
      return result;
    }

    return {
      kind:
        "OK",

      cart:
        await this.getActiveCart(
          userId,
        ),
    };
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<UpdateItemResult> {
    const result =
      await this.database.db
        .transaction(
          async (tx) => {
            await tx.execute(
              sql`
                select id
                from app_users
                where id =
                  ${userId}::uuid
                for update
              `,
            );

            const rows =
              await tx
                .select({
                  id:
                    shoppingCartItems.id,

                  cartId:
                    shoppingCartItems.cartId,

                  variantActive:
                    productVariants.active,

                  productStatus:
                    products.status,
                })
                .from(
                  shoppingCartItems,
                )
                .innerJoin(
                  shoppingCarts,
                  eq(
                    shoppingCartItems.cartId,
                    shoppingCarts.id,
                  ),
                )
                .innerJoin(
                  productVariants,
                  eq(
                    shoppingCartItems.variantId,
                    productVariants.id,
                  ),
                )
                .innerJoin(
                  products,
                  eq(
                    productVariants.productId,
                    products.id,
                  ),
                )
                .where(
                  and(
                    eq(
                      shoppingCartItems.id,
                      itemId,
                    ),
                    eq(
                      shoppingCarts.userId,
                      userId,
                    ),
                    eq(
                      shoppingCarts.status,
                      "ACTIVE",
                    ),
                  ),
                )
                .limit(1);

            const item =
              rows[0];

            if (!item) {
              return {
                kind:
                  "NOT_FOUND" as const,
              };
            }

            if (
              !item.variantActive ||
              item.productStatus !==
                "ACTIVE"
            ) {
              return {
                kind:
                  "VARIANT_UNAVAILABLE" as const,
              };
            }

            const now =
              new Date();

            await tx
              .update(
                shoppingCartItems,
              )
              .set({
                quantity,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  shoppingCartItems.id,
                  item.id,
                ),
              );

            await tx
              .update(
                shoppingCarts,
              )
              .set({
                updatedAt:
                  now,
              })
              .where(
                eq(
                  shoppingCarts.id,
                  item.cartId,
                ),
              );

            return {
              kind:
                "OK" as const,
            };
          },
        );

    if (
      result.kind !==
      "OK"
    ) {
      return result;
    }

    return {
      kind:
        "OK",

      cart:
        await this.getActiveCart(
          userId,
        ),
    };
  }

  async removeItem(
    userId: string,
    itemId: string,
  ): Promise<RemoveItemResult> {
    const result =
      await this.database.db
        .transaction(
          async (tx) => {
            await tx.execute(
              sql`
                select id
                from app_users
                where id =
                  ${userId}::uuid
                for update
              `,
            );

            const rows =
              await tx
                .select({
                  id:
                    shoppingCartItems.id,

                  cartId:
                    shoppingCartItems.cartId,
                })
                .from(
                  shoppingCartItems,
                )
                .innerJoin(
                  shoppingCarts,
                  eq(
                    shoppingCartItems.cartId,
                    shoppingCarts.id,
                  ),
                )
                .where(
                  and(
                    eq(
                      shoppingCartItems.id,
                      itemId,
                    ),
                    eq(
                      shoppingCarts.userId,
                      userId,
                    ),
                    eq(
                      shoppingCarts.status,
                      "ACTIVE",
                    ),
                  ),
                )
                .limit(1);

            const item =
              rows[0];

            if (!item) {
              return {
                kind:
                  "NOT_FOUND" as const,
              };
            }

            await tx
              .delete(
                shoppingCartItems,
              )
              .where(
                eq(
                  shoppingCartItems.id,
                  item.id,
                ),
              );

            await tx
              .update(
                shoppingCarts,
              )
              .set({
                updatedAt:
                  new Date(),
              })
              .where(
                eq(
                  shoppingCarts.id,
                  item.cartId,
                ),
              );

            return {
              kind:
                "OK" as const,
            };
          },
        );

    if (
      result.kind !==
      "OK"
    ) {
      return result;
    }

    return {
      kind:
        "OK",

      cart:
        await this.getActiveCart(
          userId,
        ),
    };
  }

  async clearCart(
    userId: string,
  ): Promise<void> {
    await this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from app_users
              where id =
                ${userId}::uuid
              for update
            `,
          );

          const rows =
            await tx
              .select({
                id:
                  shoppingCarts.id,
              })
              .from(
                shoppingCarts,
              )
              .where(
                and(
                  eq(
                    shoppingCarts.userId,
                    userId,
                  ),
                  eq(
                    shoppingCarts.status,
                    "ACTIVE",
                  ),
                ),
              )
              .limit(1);

          const cartId =
            rows[0]?.id;

          if (!cartId) {
            return;
          }

          await tx
            .delete(
              shoppingCartItems,
            )
            .where(
              eq(
                shoppingCartItems.cartId,
                cartId,
              ),
            );

          await tx
            .update(
              shoppingCarts,
            )
            .set({
              updatedAt:
                new Date(),
            })
            .where(
              eq(
                shoppingCarts.id,
                cartId,
              ),
            );
        },
      );
  }

  private async response(
    cartId: string,
  ): Promise<CartResponse> {
    const rows =
      await this.database.db
        .select({
          id:
            shoppingCartItems.id,

          variantId:
            productVariants.id,

          productId:
            products.id,

          productName:
            products.name,

          sku:
            productVariants.sku,

          size:
            productVariants.size,

          color:
            productVariants.color,

          colorHex:
            productVariants.colorHex,

          unitPrice:
            productVariants.price,

          currency:
            productVariants.currency,

          quantity:
            shoppingCartItems.quantity,
        })
        .from(
          shoppingCartItems,
        )
        .innerJoin(
          productVariants,
          eq(
            shoppingCartItems.variantId,
            productVariants.id,
          ),
        )
        .innerJoin(
          products,
          eq(
            productVariants.productId,
            products.id,
          ),
        )
        .where(
          eq(
            shoppingCartItems.cartId,
            cartId,
          ),
        )
        .orderBy(
          asc(
            products.name,
          ),
          asc(
            productVariants.sku,
          ),
        );

    const items:
      CartItemResponse[] =
      rows.map(
        (row) => {
          const unitPrice =
            Number(
              row.unitPrice,
            );

          return {
            id:
              row.id,

            variantId:
              row.variantId,

            productId:
              row.productId,

            productName:
              row.productName,

            sku:
              row.sku,

            size:
              row.size,

            color:
              row.color,

            colorHex:
              row.colorHex,

            unitPrice,

            currency:
              row.currency,

            quantity:
              row.quantity,

            subtotal:
              unitPrice *
              row.quantity,
          };
        },
      );

    return {
      id:
        cartId,

      status:
        "ACTIVE",

      items,

      totalItems:
        items.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.quantity,
          0,
        ),

      subtotal:
        items.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.subtotal,
          0,
        ),

      currency:
        "BOB",
    };
  }

  private emptyCart():
    CartResponse {
    return {
      id:
        null,

      status:
        "ACTIVE",

      items:
        [],

      totalItems:
        0,

      subtotal:
        0,

      currency:
        "BOB",
    };
  }
}
