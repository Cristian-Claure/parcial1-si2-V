import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  asc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  OperationalOrderResponse,
} from "@velora/contracts";

import {
  inventoryMovements,
  inventoryStocks,
  orderInventoryAllocations,
  orderItems,
  orders,
  payments,
  stores,
  warehouses,
  type VeloraDatabaseClient,
} from "@velora/database";

import type {
  ActorAccessContext,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  DatabaseService,
} from "../database/database.service.js";

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

@Injectable()
export class OrderOperationsRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async fulfill(
    actor: ActorAccessContext,
    orderId: string,
  ): Promise<void> {
    await this.database.db.transaction(async(tx)=>{
      const initial=await this.orderHeader(tx,orderId);if(!initial)throw new ApiHttpError(404,"Pedido no encontrado.");this.requireStoreAccess(actor,initial.storeId);await tx.execute(sql`select id from orders where id=${orderId}::uuid for update`);const order=await this.orderHeader(tx,orderId);if(!order)throw new ApiHttpError(404,"Pedido no encontrado.");this.requireStoreAccess(actor,order.storeId);if(order.status!=="RESERVED")throw new ApiHttpError(409,"Solo pueden entregarse pedidos reservados.");
      const paid=await tx.select({id:payments.id}).from(payments).where(sql`${payments.orderId}=${orderId}::uuid and ${payments.status}='PAID'`).limit(1);if(!paid[0])throw new ApiHttpError(409,"El pedido debe tener un pago confirmado antes de ser entregado.");
      const allocations=await tx.select({orderItemId:orderInventoryAllocations.orderItemId,warehouseId:orderInventoryAllocations.warehouseId,variantId:orderItems.variantId,itemQuantity:orderItems.quantity,allocationQuantity:orderInventoryAllocations.quantity}).from(orderInventoryAllocations).innerJoin(orderItems,sql`${orderInventoryAllocations.orderItemId}=${orderItems.id} and ${orderInventoryAllocations.orderId}=${orderItems.orderId}`).where(eq(orderInventoryAllocations.orderId,orderId));
      if(allocations.length===0)throw new ApiHttpError(409,"La trazabilidad de inventario del pedido es inconsistente.");const sums=new Map<string,{required:number;allocated:number}>();for(const a of allocations){const c=sums.get(a.orderItemId)??{required:a.itemQuantity,allocated:0};c.allocated+=a.allocationQuantity;sums.set(a.orderItemId,c);}if([...sums.values()].some(v=>v.required!==v.allocated))throw new ApiHttpError(409,"Las allocations del pedido no cubren exactamente sus cantidades.");
      const sorted=[...allocations].sort((a,b)=>(a.warehouseId+":"+a.variantId).localeCompare(b.warehouseId+":"+b.variantId));const stocks=new Map<string,{id:string;physicalQuantity:number;committedQuantity:number}>();for(const a of sorted){const key=a.warehouseId+":"+a.variantId;await tx.execute(sql`select id from inventory_stocks where warehouse_id=${a.warehouseId}::uuid and variant_id=${a.variantId}::uuid for update`);const rows=await tx.select({id:inventoryStocks.id,physicalQuantity:inventoryStocks.physicalQuantity,committedQuantity:inventoryStocks.committedQuantity}).from(inventoryStocks).where(sql`${inventoryStocks.warehouseId}=${a.warehouseId}::uuid and ${inventoryStocks.variantId}=${a.variantId}::uuid`).limit(1);const stock=rows[0];if(!stock||stock.committedQuantity<a.allocationQuantity||stock.physicalQuantity<a.allocationQuantity)throw new ApiHttpError(409,"El inventario comprometido del pedido es inconsistente.");stocks.set(key,stock);}
      const now=new Date();for(const a of sorted){const stock=stocks.get(a.warehouseId+":"+a.variantId);if(!stock)throw new Error("Stock bloqueado no encontrado.");const physicalAfter=stock.physicalQuantity-a.allocationQuantity;const committedAfter=stock.committedQuantity-a.allocationQuantity;if(physicalAfter<0||committedAfter<0||committedAfter>physicalAfter)throw new ApiHttpError(409,"El inventario no permite completar la venta.");await tx.update(inventoryStocks).set({physicalQuantity:physicalAfter,committedQuantity:committedAfter,version:sql<number>`${inventoryStocks.version}+1`,updatedAt:now}).where(eq(inventoryStocks.id,stock.id));await tx.insert(inventoryMovements).values({id:randomUUID(),warehouseId:a.warehouseId,variantId:a.variantId,movementType:"SALE",quantity:a.allocationQuantity,physicalDelta:-a.allocationQuantity,committedDelta:-a.allocationQuantity,physicalBefore:stock.physicalQuantity,physicalAfter,committedBefore:stock.committedQuantity,committedAfter,referenceType:"ORDER",referenceId:order.id,reason:"Venta por cumplimiento del pedido "+order.orderNumber,performedBy:actor.userId,createdAt:now});}
      await tx.update(orders).set({status:"FULFILLED",fulfilledAt:now,updatedAt:now}).where(eq(orders.id,order.id));
    });
  }

  async get(
    orderId:
      string,
  ): Promise<
    OperationalOrderResponse |
    null
  > {
    const headers =
      await this.database.db
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          warehouseId:
            orders.warehouseId,

          storeId:
            stores.id,

          storeName:
            stores.name,

          fulfillmentType:
            orders.fulfillmentType,

          status:
            orders.status,

          currency:
            orders.currency,

          subtotal:
            orders.subtotal,

          total:
            orders.total,

          recipientName:
            orders.recipientName,

          recipientPhone:
            orders.recipientPhone,

          department:
            orders.department,

          city:
            orders.city,

          zone:
            orders.zone,

          addressLine:
            orders.addressLine,

          addressReference:
            orders.addressReference,

          notes:
            orders.notes,

          createdAt:
            orders.createdAt,

          cancelledAt:
            orders.cancelledAt,

          fulfilledAt:
            orders.fulfilledAt,
        })
        .from(
          orders,
        )
        .innerJoin(
          warehouses,
          eq(
            orders.warehouseId,
            warehouses.id,
          ),
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .where(
          eq(
            orders.id,
            orderId,
          ),
        )
        .limit(1);

    const header =
      headers[0];

    if (!header) {
      return null;
    }

    const items =
      await this.database.db
        .select({
          id:
            orderItems.id,

          variantId:
            orderItems.variantId,

          productName:
            orderItems.productName,

          sku:
            orderItems.sku,

          size:
            orderItems.size,

          color:
            orderItems.color,

          unitPrice:
            orderItems.unitPrice,

          currency:
            orderItems.currency,

          quantity:
            orderItems.quantity,

          subtotal:
            orderItems.subtotal,
        })
        .from(
          orderItems,
        )
        .where(
          eq(
            orderItems.orderId,
            orderId,
          ),
        )
        .orderBy(
          asc(
            orderItems.productName,
          ),
          asc(
            orderItems.sku,
          ),
        );

    return {
      id:
        header.id,

      orderNumber:
        header.orderNumber,

      warehouseId:
        header.warehouseId,

      storeId:
        header.storeId,

      storeName:
        header.storeName,

      fulfillmentType:
        header.fulfillmentType,

      status:
        header.status,

      currency:
        header.currency,

      subtotal:
        Number(
          header.subtotal,
        ),

      total:
        Number(
          header.total,
        ),

      recipientName:
        header.recipientName,

      recipientPhone:
        header.recipientPhone,

      department:
        header.department,

      city:
        header.city,

      zone:
        header.zone,

      addressLine:
        header.addressLine,

      addressReference:
        header.addressReference,

      notes:
        header.notes,

      createdAt:
        header.createdAt
          .toISOString(),

      cancelledAt:
        header.cancelledAt
          ?.toISOString() ??
        null,

      fulfilledAt:
        header.fulfilledAt
          ?.toISOString() ??
        null,

      items:
        items.map(
          (item) => ({
            id:
              item.id,

            variantId:
              item.variantId,

            productName:
              item.productName,

            sku:
              item.sku,

            size:
              item.size,

            color:
              item.color,

            unitPrice:
              Number(
                item.unitPrice,
              ),

            currency:
              item.currency,

            quantity:
              item.quantity,

            subtotal:
              Number(
                item.subtotal,
              ),
          }),
        ),
    };
  }

  private async orderHeader(
    tx:
      VeloraTransaction,
    orderId:
      string,
  ) {
    const rows =
      await tx
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          warehouseId:
            orders.warehouseId,

          storeId:
            stores.id,

          status:
            orders.status,
        })
        .from(
          orders,
        )
        .innerJoin(
          warehouses,
          eq(
            orders.warehouseId,
            warehouses.id,
          ),
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .where(
          eq(
            orders.id,
            orderId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private requireStoreAccess(
    actor:
      ActorAccessContext,
    orderStoreId:
      string,
  ): void {
    if (
      actor.role ===
      "ADMIN"
    ) {
      return;
    }

    if (
      actor.role !==
      "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para completar pedidos.",
      );
    }

    if (
      !actor.storeId
    ) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    if (
      actor.storeId !==
      orderStoreId
    ) {
      throw new ApiHttpError(
        403,
        "No puede completar pedidos de otra sucursal.",
      );
    }
  }
}
