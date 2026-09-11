import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CreateOrderRequest,
  OfflineOrderItemRequest,
  OrderResponse,
  SyncOfflineOrderRequest,
} from "@velora/contracts";

import {
  customerAddresses,
  inventoryMovements,
  inventoryStocks,
  orderInventoryAllocations,
  orderItems,
  orders,
  payments,
  productVariants,
  products,
  shoppingCartItems,
  shoppingCarts,
  stores,
  warehouses,
  type VeloraDatabaseClient,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export type OrderFailure =
  | {
      kind:
        "NO_ACTIVE_CART";
    }
  | {
      kind:
        "EMPTY_CART";
    }
  | {
      kind:
        "WAREHOUSE_NOT_FOUND";
    }
  | {
      kind:
        "WAREHOUSE_INACTIVE";
    }
  | {
      kind:
        "PICKUP_WAREHOUSE_INVALID";
    }
  | {
      kind:
        "STORE_WAREHOUSE_INVALID";
    }
  | {
      kind:
        "CART_STORE_MISMATCH";
    }
  | {
      kind:
        "DELIVERY_ADDRESS_REQUIRED";
    }
  | {
      kind:
        "PICKUP_ADDRESS_FORBIDDEN";
    }
  | {
      kind:
        "ADDRESS_NOT_FOUND";
    }
  | {
      kind:
        "VARIANT_MISSING";
    }
  | {
      kind:
        "VARIANT_UNAVAILABLE";
    }
  | {
      kind:
        "CURRENCY_MISMATCH";
    }
  | {
      kind:
        "COMPANY_MISMATCH";
    }
  | {
      kind:
        "STOCK_MISSING";

      sku:
        string;
    }
  | {
      kind:
        "STOCK_INSUFFICIENT";

      sku:
        string;

      available:
        number;

      requested:
        number;
    }
  | {
      kind:
        "OPERATION_ALREADY_USED";
    }
  | {
      kind:
        "OPERATION_CONFLICT";
    }
  | {
      kind:
        "ORDER_NOT_FOUND";
    }
  | {
      kind:
        "ORDER_NOT_RESERVED";
    }
  | {
      kind:
        "PAYMENT_PAID";
    }
  | {
      kind:
        "PAYMENT_PENDING";
    }
  | {
      kind:
        "RESERVATION_STOCK_MISSING";
    }
  | {
      kind:
        "RESERVATION_INCONSISTENT";
    };

export type OrderMutationResult =
  | {
      kind:
        "OK";

      orderId:
        string;

      idempotent?:
        boolean;
    }
  | OrderFailure;

interface WarehouseCheckoutRecord {
  id:
    string;

  storeId:
    string;

  storeName:
    string;

  storeAddress:
    string |
    null;

  companyId:
    string;

  active:
    boolean;

  defaultWarehouse:
    boolean;

  storeActive:
    boolean;
}

interface StockAllocation {
  warehouseId: string;
  quantity: number;
  stock: { id: string; physicalQuantity: number; committedQuantity: number };
}

interface AddressSnapshotRecord {
  id:
    string;

  recipientName:
    string;

  recipientPhone:
    string;

  department:
    string;

  city:
    string;

  zone:
    string |
    null;

  addressLine:
    string;

  addressReference:
    string |
    null;
}

interface SaleLine {
  variantId:
    string;

  quantity:
    number;

  productName:
    string;

  productStatus:
    "DRAFT" |
    "ACTIVE" |
    "INACTIVE";

  productCompanyId:
    string;

  sku:
    string;

  size:
    string;

  color:
    string;

  price:
    string;

  currency:
    string;

  variantActive:
    boolean;
}

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async createOnline(
    customerId: string,
    request: CreateOrderRequest,
    idempotencyKeyHash: string,
  ): Promise<OrderMutationResult> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${customerId + ":" + idempotencyKeyHash}, 0))`);
      await tx.execute(sql`select id from app_users where id = ${customerId}::uuid for update`);
      const existingRows = await tx.select({id:orders.id,warehouseId:orders.warehouseId,fulfillmentType:orders.fulfillmentType,addressId:orders.addressId,notes:orders.notes}).from(orders).where(and(eq(orders.customerId,customerId),eq(orders.idempotencyKeyHash,idempotencyKeyHash))).limit(1);
      const existing=existingRows[0];
      if(existing){const same=existing.warehouseId===request.warehouseId&&existing.fulfillmentType===request.fulfillmentType&&existing.addressId===(request.addressId??null)&&this.trimToNull(existing.notes)===this.trimToNull(request.notes);return same?{kind:"OK" as const,orderId:existing.id,idempotent:true}:{kind:"OPERATION_CONFLICT" as const};}
      const cartRows=await tx.select({id:shoppingCarts.id,storeId:shoppingCarts.storeId}).from(shoppingCarts).where(and(eq(shoppingCarts.userId,customerId),eq(shoppingCarts.companyId,request.companyId),eq(shoppingCarts.status,"ACTIVE"))).limit(1);
      const cart=cartRows[0]; if(!cart)return{kind:"NO_ACTIVE_CART" as const};
      await tx.execute(sql`select id from shopping_carts where id = ${cart.id}::uuid for update`);
      const lines=await tx.select({variantId:productVariants.id,quantity:shoppingCartItems.quantity,productName:products.name,productStatus:products.status,productCompanyId:products.companyId,sku:productVariants.sku,size:productVariants.size,color:productVariants.color,price:productVariants.price,currency:productVariants.currency,variantActive:productVariants.active}).from(shoppingCartItems).innerJoin(productVariants,eq(shoppingCartItems.variantId,productVariants.id)).innerJoin(products,eq(productVariants.productId,products.id)).where(eq(shoppingCartItems.cartId,cart.id));
      if(lines.length===0)return{kind:"EMPTY_CART" as const};
      const wr=await this.warehouseForCheckout(tx,request.warehouseId);if(wr.kind!=="OK")return wr;const warehouse=wr.warehouse;
      if(!warehouse.defaultWarehouse||!warehouse.storeActive)return{kind:"STORE_WAREHOUSE_INVALID" as const};
      if(warehouse.companyId!==request.companyId)return{kind:"COMPANY_MISMATCH" as const};
      if(cart.storeId&&cart.storeId!==warehouse.storeId)return{kind:"CART_STORE_MISMATCH" as const};
      const ar=await this.addressForCheckout(tx,customerId,request.fulfillmentType,request.addressId??null);if(ar.kind!=="OK")return ar;
      const sorted=[...lines].sort((a,b)=>a.variantId.localeCompare(b.variantId));const byVariant=new Map<string,StockAllocation[]>();let currency:string|null=null;let subtotal=0;
      for(const line of sorted){const vr=await this.lockAndAllocateLine(tx,warehouse,line,line.quantity,request.fulfillmentType);if(vr.kind!=="OK")return vr;if(currency===null)currency=line.currency;else if(currency!==line.currency)return{kind:"CURRENCY_MISMATCH" as const};byVariant.set(line.variantId,vr.allocations);subtotal+=Number(line.price)*line.quantity;}
      if(!currency)return{kind:"EMPTY_CART" as const};
      const orderId=randomUUID();const orderNumber=this.generateOrderNumber();const now=new Date();const address=ar.address;
      await tx.insert(orders).values({id:orderId,orderNumber,orderChannel:"ECOMMERCE",customerId,sourceCartId:cart.id,warehouseId:warehouse.id,addressId:address?.id??null,pointOfSaleId:null,cashSessionId:null,fulfillmentType:request.fulfillmentType,status:"RESERVED",currency,subtotal:subtotal.toFixed(2),total:subtotal.toFixed(2),recipientName:address?.recipientName??null,recipientPhone:address?.recipientPhone??null,department:address?.department??null,city:address?.city??null,zone:address?.zone??null,addressLine:address?.addressLine??null,addressReference:address?.addressReference??null,notes:this.trimToNull(request.notes),idempotencyKeyHash,clientOperationId:null,clientCreatedAt:null,syncedAt:null,cancelledAt:null,fulfilledAt:null,createdAt:now,updatedAt:now});
      for(const line of sorted){const orderItemId=randomUUID();await tx.insert(orderItems).values({id:orderItemId,orderId,variantId:line.variantId,productName:line.productName,sku:line.sku,size:line.size,color:line.color,unitPrice:line.price,currency:line.currency,quantity:line.quantity,subtotal:(Number(line.price)*line.quantity).toFixed(2),createdAt:now});const allocs=byVariant.get(line.variantId);if(!allocs?.length)throw new Error("No se encontraron allocations del pedido.");for(const a of allocs){await this.reserveStock(tx,a.stock,a.warehouseId,line.variantId,a.quantity,orderId,orderNumber,customerId,now);await tx.insert(orderInventoryAllocations).values({orderId,orderItemId,warehouseId:a.warehouseId,quantity:a.quantity,createdAt:now});}}
      await tx.update(shoppingCarts).set({storeId:warehouse.storeId,status:"CONVERTED",updatedAt:now}).where(eq(shoppingCarts.id,cart.id));return{kind:"OK" as const,orderId};
    });
  }

  async syncOffline(
    customerId: string,
    request: SyncOfflineOrderRequest,
    normalizedItems: OfflineOrderItemRequest[],
  ): Promise<OrderMutationResult> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${request.clientOperationId}::text,0))`);
      await tx.execute(sql`select id from app_users where id=${customerId}::uuid for update`);
      const existingRows=await tx.select({id:orders.id,customerId:orders.customerId,orderChannel:orders.orderChannel,warehouseId:orders.warehouseId,fulfillmentType:orders.fulfillmentType,addressId:orders.addressId,clientCreatedAt:orders.clientCreatedAt,notes:orders.notes}).from(orders).where(eq(orders.clientOperationId,request.clientOperationId)).limit(1);
      const existing=existingRows[0];
      if(existing){
        if(existing.orderChannel!=="ECOMMERCE"||existing.customerId!==customerId)return{kind:"OPERATION_ALREADY_USED" as const};
        const sameHeader=existing.warehouseId===request.warehouseId&&existing.fulfillmentType===request.fulfillmentType&&existing.addressId===(request.addressId??null)&&(existing.clientCreatedAt?.getTime()??null)===new Date(request.clientCreatedAt).getTime()&&this.trimToNull(existing.notes)===this.trimToNull(request.notes);
        if(!sameHeader)return{kind:"OPERATION_CONFLICT" as const};
        const stored=await tx.select({variantId:orderItems.variantId,quantity:orderItems.quantity}).from(orderItems).where(eq(orderItems.orderId,existing.id)).orderBy(asc(orderItems.variantId));const wanted=[...normalizedItems].sort((a,b)=>a.variantId.localeCompare(b.variantId));
        if(stored.length!==wanted.length)return{kind:"OPERATION_CONFLICT" as const};
        for(let i=0;i<stored.length;i+=1){const storedItem=stored[i];const wantedItem=wanted[i];if(!storedItem||!wantedItem||storedItem.variantId!==wantedItem.variantId||storedItem.quantity!==wantedItem.quantity)return{kind:"OPERATION_CONFLICT" as const};}
        return{kind:"OK" as const,orderId:existing.id,idempotent:true};
      }
      const wr=await this.warehouseForCheckout(tx,request.warehouseId);if(wr.kind!=="OK")return wr;const warehouse=wr.warehouse;
      if(!warehouse.defaultWarehouse||!warehouse.storeActive)return{kind:"STORE_WAREHOUSE_INVALID" as const};
      const ar=await this.addressForCheckout(tx,customerId,request.fulfillmentType,request.addressId??null);if(ar.kind!=="OK")return ar;
      let sourceCartId:string|null=null;
      if(request.sourceCartId){
        const sr=await tx.select({id:shoppingCarts.id,companyId:shoppingCarts.companyId,storeId:shoppingCarts.storeId}).from(shoppingCarts).where(and(eq(shoppingCarts.id,request.sourceCartId),eq(shoppingCarts.userId,customerId),eq(shoppingCarts.status,"ACTIVE"))).limit(1);const source=sr[0];
        if(source){if(source.companyId!==warehouse.companyId)return{kind:"COMPANY_MISMATCH" as const};if(source.storeId&&source.storeId!==warehouse.storeId)return{kind:"CART_STORE_MISMATCH" as const};sourceCartId=source.id;await tx.execute(sql`select id from shopping_carts where id=${sourceCartId}::uuid for update`);}
      }
      const sortedItems=[...normalizedItems].sort((a,b)=>a.variantId.localeCompare(b.variantId));const saleLines:SaleLine[]=[];const byVariant=new Map<string,StockAllocation[]>();let currency:string|null=null;let subtotal=0;
      for(const requestedItem of sortedItems){
        const vr=await tx.select({variantId:productVariants.id,productName:products.name,productStatus:products.status,productCompanyId:products.companyId,sku:productVariants.sku,size:productVariants.size,color:productVariants.color,price:productVariants.price,currency:productVariants.currency,variantActive:productVariants.active}).from(productVariants).innerJoin(products,eq(productVariants.productId,products.id)).where(eq(productVariants.id,requestedItem.variantId)).limit(1);const variant=vr[0];if(!variant)return{kind:"VARIANT_MISSING" as const};const line:SaleLine={...variant,quantity:requestedItem.quantity};const validation=await this.lockAndAllocateLine(tx,warehouse,line,requestedItem.quantity,request.fulfillmentType);if(validation.kind!=="OK")return validation;if(currency===null)currency=line.currency;else if(currency!==line.currency)return{kind:"CURRENCY_MISMATCH" as const};byVariant.set(line.variantId,validation.allocations);saleLines.push(line);subtotal+=Number(line.price)*line.quantity;
      }
      if(!currency||saleLines.length===0)return{kind:"EMPTY_CART" as const};
      const orderId=randomUUID();const orderNumber=this.generateOrderNumber();const now=new Date();const address=ar.address;
      await tx.insert(orders).values({id:orderId,orderNumber,orderChannel:"ECOMMERCE",customerId,sourceCartId:null,warehouseId:warehouse.id,addressId:address?.id??null,pointOfSaleId:null,cashSessionId:null,fulfillmentType:request.fulfillmentType,status:"RESERVED",currency,subtotal:subtotal.toFixed(2),total:subtotal.toFixed(2),recipientName:address?.recipientName??null,recipientPhone:address?.recipientPhone??null,department:address?.department??null,city:address?.city??null,zone:address?.zone??null,addressLine:address?.addressLine??null,addressReference:address?.addressReference??null,notes:this.trimToNull(request.notes),idempotencyKeyHash:null,clientOperationId:request.clientOperationId,clientCreatedAt:new Date(request.clientCreatedAt),syncedAt:now,cancelledAt:null,fulfilledAt:null,createdAt:now,updatedAt:now});
      for(const line of saleLines){const orderItemId=randomUUID();await tx.insert(orderItems).values({id:orderItemId,orderId,variantId:line.variantId,productName:line.productName,sku:line.sku,size:line.size,color:line.color,unitPrice:line.price,currency:line.currency,quantity:line.quantity,subtotal:(Number(line.price)*line.quantity).toFixed(2),createdAt:now});const allocs=byVariant.get(line.variantId);if(!allocs?.length)throw new Error("No se encontraron allocations del pedido offline.");for(const a of allocs){await this.reserveStock(tx,a.stock,a.warehouseId,line.variantId,a.quantity,orderId,orderNumber,customerId,now);await tx.insert(orderInventoryAllocations).values({orderId,orderItemId,warehouseId:a.warehouseId,quantity:a.quantity,createdAt:now});}}
      if(sourceCartId){for(const item of sortedItems){const cir=await tx.select({id:shoppingCartItems.id,quantity:shoppingCartItems.quantity}).from(shoppingCartItems).where(and(eq(shoppingCartItems.cartId,sourceCartId),eq(shoppingCartItems.variantId,item.variantId))).limit(1);const cartItem=cir[0];if(!cartItem)continue;const remaining=cartItem.quantity-item.quantity;if(remaining>0)await tx.update(shoppingCartItems).set({quantity:remaining,updatedAt:now}).where(eq(shoppingCartItems.id,cartItem.id));else await tx.delete(shoppingCartItems).where(eq(shoppingCartItems.id,cartItem.id));}await tx.update(shoppingCarts).set({storeId:warehouse.storeId,updatedAt:now}).where(eq(shoppingCarts.id,sourceCartId));}
      return{kind:"OK" as const,orderId};
    });
  }

  async listForCustomer(
    customerId: string,
  ): Promise<
    OrderResponse[]
  > {
    const rows =
      await this.database.db
        .select({
          id:
            orders.id,
        })
        .from(
          orders,
        )
        .where(
          eq(
            orders.customerId,
            customerId,
          ),
        )
        .orderBy(
          desc(
            orders.createdAt,
          ),
        );

    const result:
      OrderResponse[] =
      [];

    for (const row of rows) {
      const order =
        await this.responseForCustomer(
          customerId,
          row.id,
        );

      if (order) {
        result.push(
          order,
        );
      }
    }

    return result;
  }

  async getForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<
    OrderResponse |
    null
  > {
    return this.responseForCustomer(
      customerId,
      orderId,
    );
  }

  async cancel(
    customerId: string,
    orderId: string,
  ): Promise<OrderMutationResult> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from orders where id=${orderId}::uuid and customer_id=${customerId}::uuid for update`);
      const rows=await tx.select({id:orders.id,orderNumber:orders.orderNumber,status:orders.status}).from(orders).where(and(eq(orders.id,orderId),eq(orders.customerId,customerId))).limit(1);const order=rows[0];if(!order)return{kind:"ORDER_NOT_FOUND" as const};if(order.status!=="RESERVED")return{kind:"ORDER_NOT_RESERVED" as const};
      const paid=await tx.select({id:payments.id}).from(payments).where(and(eq(payments.orderId,orderId),eq(payments.status,"PAID"))).limit(1);if(paid[0])return{kind:"PAYMENT_PAID" as const};const pending=await tx.select({id:payments.id}).from(payments).where(and(eq(payments.orderId,orderId),eq(payments.status,"PENDING"))).limit(1);if(pending[0])return{kind:"PAYMENT_PENDING" as const};
      const allocations=await tx.select({orderItemId:orderInventoryAllocations.orderItemId,warehouseId:orderInventoryAllocations.warehouseId,variantId:orderItems.variantId,itemQuantity:orderItems.quantity,allocationQuantity:orderInventoryAllocations.quantity}).from(orderInventoryAllocations).innerJoin(orderItems,and(eq(orderInventoryAllocations.orderItemId,orderItems.id),eq(orderInventoryAllocations.orderId,orderItems.orderId))).where(eq(orderInventoryAllocations.orderId,orderId));
      if(!this.allocationsComplete(allocations))return{kind:"RESERVATION_INCONSISTENT" as const};
      const sorted=[...allocations].sort((a,b)=>(a.warehouseId+":"+a.variantId).localeCompare(b.warehouseId+":"+b.variantId));const stocks=new Map<string,{id:string;physicalQuantity:number;committedQuantity:number}>();
      for(const a of sorted){const key=a.warehouseId+":"+a.variantId;await tx.execute(sql`select id from inventory_stocks where warehouse_id=${a.warehouseId}::uuid and variant_id=${a.variantId}::uuid for update`);const sr=await tx.select({id:inventoryStocks.id,physicalQuantity:inventoryStocks.physicalQuantity,committedQuantity:inventoryStocks.committedQuantity}).from(inventoryStocks).where(and(eq(inventoryStocks.warehouseId,a.warehouseId),eq(inventoryStocks.variantId,a.variantId))).limit(1);const stock=sr[0];if(!stock)return{kind:"RESERVATION_STOCK_MISSING" as const};if(stock.committedQuantity<a.allocationQuantity)return{kind:"RESERVATION_INCONSISTENT" as const};stocks.set(key,stock);}
      const now=new Date();for(const a of sorted){const key=a.warehouseId+":"+a.variantId;const stock=stocks.get(key);if(!stock)throw new Error("Stock bloqueado no encontrado.");const committedAfter=stock.committedQuantity-a.allocationQuantity;await tx.update(inventoryStocks).set({committedQuantity:committedAfter,version:sql<number>`${inventoryStocks.version}+1`,updatedAt:now}).where(eq(inventoryStocks.id,stock.id));await tx.insert(inventoryMovements).values({id:randomUUID(),warehouseId:a.warehouseId,variantId:a.variantId,movementType:"RELEASE",quantity:a.allocationQuantity,physicalDelta:0,committedDelta:-a.allocationQuantity,physicalBefore:stock.physicalQuantity,physicalAfter:stock.physicalQuantity,committedBefore:stock.committedQuantity,committedAfter,referenceType:"ORDER",referenceId:order.id,reason:"Liberación por cancelación del pedido "+order.orderNumber,performedBy:customerId,createdAt:now});}
      await tx.update(orders).set({status:"CANCELLED",cancelledAt:now,updatedAt:now}).where(eq(orders.id,order.id));return{kind:"OK" as const,orderId:order.id};
    });
  }

  private async responseForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<
    OrderResponse |
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
          and(
            eq(
              orders.id,
              orderId,
            ),
            eq(
              orders.customerId,
              customerId,
            ),
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

    const fulfillmentType =
      header.fulfillmentType;

    if (
      fulfillmentType ===
      "IN_STORE"
    ) {
      throw new Error(
        "Un pedido CUSTOMER no puede ser IN_STORE.",
      );
    }

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

      fulfillmentType,

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

  private async warehouseForCheckout(
    tx:
      VeloraTransaction,
    warehouseId: string,
  ): Promise<
    | {
        kind:
          "OK";

        warehouse:
          WarehouseCheckoutRecord;
      }
    | {
        kind:
          "WAREHOUSE_NOT_FOUND";
      }
    | {
        kind:
          "WAREHOUSE_INACTIVE";
      }
  > {
    const rows =
      await tx
        .select({
          id:
            warehouses.id,

          storeId:
            stores.id,

          storeName:
            stores.name,

          storeAddress:
            stores.address,

          companyId:
            stores.companyId,

          active:
            warehouses.active,

          defaultWarehouse:
            warehouses.defaultWarehouse,

          storeActive:
            stores.active,
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
          eq(
            warehouses.id,
            warehouseId,
          ),
        )
        .limit(1);

    const warehouse =
      rows[0];

    if (!warehouse) {
      return {
        kind:
          "WAREHOUSE_NOT_FOUND",
      };
    }

    if (!warehouse.active) {
      return {
        kind:
          "WAREHOUSE_INACTIVE",
      };
    }

    return {
      kind:
        "OK",

      warehouse,
    };
  }

  private async addressForCheckout(
    tx:
      VeloraTransaction,
    customerId: string,
    fulfillmentType:
      "DELIVERY" |
      "PICKUP",
    addressId:
      string |
      null,
  ): Promise<
    | {
        kind:
          "OK";

        address:
          AddressSnapshotRecord |
          null;
      }
    | {
        kind:
          "DELIVERY_ADDRESS_REQUIRED";
      }
    | {
        kind:
          "PICKUP_ADDRESS_FORBIDDEN";
      }
    | {
        kind:
          "ADDRESS_NOT_FOUND";
      }
  > {
    if (
      fulfillmentType ===
      "PICKUP"
    ) {
      if (addressId) {
        return {
          kind:
            "PICKUP_ADDRESS_FORBIDDEN",
        };
      }

      return {
        kind:
          "OK",

        address:
          null,
      };
    }

    if (!addressId) {
      return {
        kind:
          "DELIVERY_ADDRESS_REQUIRED",
      };
    }

    const rows =
      await tx
        .select({
          id:
            customerAddresses.id,

          recipientName:
            customerAddresses.recipientName,

          recipientPhone:
            customerAddresses.recipientPhone,

          department:
            customerAddresses.department,

          city:
            customerAddresses.city,

          zone:
            customerAddresses.zone,

          addressLine:
            customerAddresses.addressLine,

          addressReference:
            customerAddresses.reference,
        })
        .from(
          customerAddresses,
        )
        .where(
          and(
            eq(
              customerAddresses.id,
              addressId,
            ),
            eq(
              customerAddresses.userId,
              customerId,
            ),
            eq(
              customerAddresses.active,
              true,
            ),
          ),
        )
        .limit(1);

    const address =
      rows[0];

    if (!address) {
      return {
        kind:
          "ADDRESS_NOT_FOUND",
      };
    }

    return {
      kind:
        "OK",

      address,
    };
  }

  private async lockAndAllocateLine(
    tx: VeloraTransaction,
    warehouse: WarehouseCheckoutRecord,
    line: SaleLine,
    requested: number,
    fulfillmentType: "DELIVERY" | "PICKUP",
  ): Promise<{kind:"OK";allocations:StockAllocation[]} | OrderFailure> {
    if(!line.variantActive||line.productStatus!=="ACTIVE")return{kind:"VARIANT_UNAVAILABLE"};if(line.productCompanyId!==warehouse.companyId)return{kind:"COMPANY_MISMATCH"};
    const candidates=fulfillmentType==="PICKUP"?[{id:warehouse.id,defaultWarehouse:true}]:await tx.select({id:warehouses.id,defaultWarehouse:warehouses.defaultWarehouse}).from(warehouses).where(and(eq(warehouses.storeId,warehouse.storeId),eq(warehouses.active,true))).orderBy(desc(warehouses.defaultWarehouse),asc(warehouses.id));
    let remaining=requested, availableTotal=0;const allocations:StockAllocation[]=[];
    for(const candidate of candidates){await tx.execute(sql`select id from inventory_stocks where warehouse_id=${candidate.id}::uuid and variant_id=${line.variantId}::uuid for update`);const rows=await tx.select({id:inventoryStocks.id,physicalQuantity:inventoryStocks.physicalQuantity,committedQuantity:inventoryStocks.committedQuantity}).from(inventoryStocks).where(and(eq(inventoryStocks.warehouseId,candidate.id),eq(inventoryStocks.variantId,line.variantId))).limit(1);const stock=rows[0];if(!stock)continue;const available=Math.max(0,stock.physicalQuantity-stock.committedQuantity);availableTotal+=available;if(remaining<=0||available<=0)continue;const quantity=Math.min(remaining,available);allocations.push({warehouseId:candidate.id,quantity,stock});remaining-=quantity;}
    if(allocations.length===0)return{kind:"STOCK_MISSING",sku:line.sku};if(remaining>0)return{kind:"STOCK_INSUFFICIENT",sku:line.sku,available:availableTotal,requested};return{kind:"OK",allocations};
  }

  private allocationsComplete(rows: Array<{orderItemId:string;itemQuantity:number;allocationQuantity:number}>): boolean {
    if(rows.length===0)return false;const sums=new Map<string,{required:number;allocated:number}>();for(const row of rows){const current=sums.get(row.orderItemId)??{required:row.itemQuantity,allocated:0};current.allocated+=row.allocationQuantity;sums.set(row.orderItemId,current);}return [...sums.values()].every((value)=>value.required===value.allocated);
  }

  private async reserveStock(
    tx:
      VeloraTransaction,
    stock: {
      id:
        string;

      physicalQuantity:
        number;

      committedQuantity:
        number;
    },
    warehouseId: string,
    variantId: string,
    quantity: number,
    orderId: string,
    orderNumber: string,
    customerId: string,
    now: Date,
  ): Promise<void> {
    const committedAfter =
      stock.committedQuantity +
      quantity;

    await tx
      .update(
        inventoryStocks,
      )
      .set({
        committedQuantity:
          committedAfter,

        version:
          sql<number>`
            ${inventoryStocks.version}
            +
            1
          `,

        updatedAt:
          now,
      })
      .where(
        eq(
          inventoryStocks.id,
          stock.id,
        ),
      );

    await tx
      .insert(
        inventoryMovements,
      )
      .values({
        id:
          randomUUID(),

        warehouseId,

        variantId,

        movementType:
          "RESERVE",

        quantity,

        physicalDelta:
          0,

        committedDelta:
          quantity,

        physicalBefore:
          stock.physicalQuantity,

        physicalAfter:
          stock.physicalQuantity,

        committedBefore:
          stock.committedQuantity,

        committedAfter,

        referenceType:
          "ORDER",

        referenceId:
          orderId,

        reason:
          "Reserva por pedido " +
          orderNumber,

        performedBy:
          customerId,

        createdAt:
          now,
      });
  }

  private generateOrderNumber():
    string {
    const now =
      new Date();

    const date =
      [
        now.getUTCFullYear(),
        String(
          now.getUTCMonth() +
          1,
        ).padStart(
          2,
          "0",
        ),
        String(
          now.getUTCDate(),
        ).padStart(
          2,
          "0",
        ),
      ].join(
        "",
      );

    const random =
      randomUUID()
        .replaceAll(
          "-",
          "",
        )
        .slice(
          0,
          12,
        )
        .toUpperCase();

    return (
      "VEL-" +
      date +
      "-" +
      random
    );
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string |
    null {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value.trim().length ===
        0
    ) {
      return null;
    }

    return value.trim();
  }
}