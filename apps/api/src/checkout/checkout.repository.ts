import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  eq,
} from "drizzle-orm";

import {
  inventoryStocks,
  shoppingCartItems,
  shoppingCarts,
  stores,
  warehouses,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface CheckoutCartLine {
  variantId:
    string;

  quantity:
    number;
}

export interface CheckoutWarehouseCandidate {
  warehouseId:
    string;

  warehouseCode:
    string;

  warehouseName:
    string;

  storeId:
    string;

  storeName:
    string;

  storeAddress:
    string |
    null;
}

@Injectable()
export class CheckoutRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async activeCartLines(
    customerId: string,
  ): Promise<
    CheckoutCartLine[]
  > {
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
              customerId,
            ),
            eq(
              shoppingCarts.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1);

    const cartId =
      carts[0]?.id;

    if (!cartId) {
      return [];
    }

    return this.database.db
      .select({
        variantId:
          shoppingCartItems.variantId,

        quantity:
          shoppingCartItems.quantity,
      })
      .from(
        shoppingCartItems,
      )
      .where(
        eq(
          shoppingCartItems.cartId,
          cartId,
        ),
      );
  }

  async activeDefaultWarehouses():
    Promise<
      CheckoutWarehouseCandidate[]
    > {
    return this.database.db
      .select({
        warehouseId:
          warehouses.id,

        warehouseCode:
          warehouses.code,

        warehouseName:
          warehouses.name,

        storeId:
          stores.id,

        storeName:
          stores.name,

        storeAddress:
          stores.address,
      })
      .from(
        warehouses,
      )
      .innerJoin(
        stores,
        eq(
          warehouses.storeId,
          stores.id,
        ),
      )
      .where(
        and(
          eq(
            warehouses.defaultWarehouse,
            true,
          ),
          eq(
            warehouses.active,
            true,
          ),
          eq(
            stores.active,
            true,
          ),
        ),
      )
      .orderBy(
        asc(
          stores.name,
        ),
        asc(
          warehouses.name,
        ),
      );
  }

  async canFulfill(
    warehouseId: string,
    lines:
      CheckoutCartLine[],
  ): Promise<boolean> {
    for (const line of lines) {
      const rows =
        await this.database.db
          .select({
            physicalQuantity:
              inventoryStocks.physicalQuantity,

            committedQuantity:
              inventoryStocks.committedQuantity,
          })
          .from(
            inventoryStocks,
          )
          .where(
            and(
              eq(
                inventoryStocks.warehouseId,
                warehouseId,
              ),
              eq(
                inventoryStocks.variantId,
                line.variantId,
              ),
            ),
          )
          .limit(1);

      const stock =
        rows[0];

      if (
        !stock ||
        (
          stock.physicalQuantity -
          stock.committedQuantity
        ) <
          line.quantity
      ) {
        return false;
      }
    }

    return true;
  }
}