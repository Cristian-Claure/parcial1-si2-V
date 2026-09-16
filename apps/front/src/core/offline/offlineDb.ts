import Dexie, {
  type EntityTable,
} from "dexie";

import type {
  CartResponse,
  CheckoutWarehouseResponse,
  CreatePosSaleRequest,
  CustomerAddressResponse,
  SyncOfflineOrderRequest,
} from "@velora/contracts";

export type OfflineOrderStatus =
  | "PENDING"
  | "CONFLICT";

export interface OfflineOrderEntry {
  id: string;
  userId: string;
  status: OfflineOrderStatus;
  request: SyncOfflineOrderRequest;
  createdAt: string;
  errorMessage: string | null;
}

export interface OfflinePosItemSnapshot {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface OfflinePosSaleEntry {
  id: string;
  userId: string;
  status: OfflineOrderStatus;
  pointOfSaleId: string;
  warehouseId: string;
  cashSessionId: string;
  request: CreatePosSaleRequest;
  items: OfflinePosItemSnapshot[];
  total: number;
  currency: string;
  createdAt: string;
  errorMessage: string | null;
}

interface CartCache {
  userId: string;
  cart: CartResponse;
  updatedAt: string;
}

interface CheckoutCache {
  userId: string;
  warehouses: CheckoutWarehouseResponse[];
  addresses: CustomerAddressResponse[];
  updatedAt: string;
}

class VeloraOfflineDatabase extends Dexie {
  cartCache!:
    EntityTable<
      CartCache,
      "userId"
    >;

  checkoutCache!:
    EntityTable<
      CheckoutCache,
      "userId"
    >;

  offlineOrders!:
    EntityTable<
      OfflineOrderEntry,
      "id"
    >;

  posSales!:
    EntityTable<
      OfflinePosSaleEntry,
      "id"
    >;

  constructor() {
    super(
      "velora-customer-v2",
    );

    this.version(1)
      .stores({
        cartCache:
          "userId",
        checkoutCache:
          "userId",
        offlineOrders:
          "id,userId,status,createdAt",
      });

    this.version(2)
      .stores({
        cartCache:
          "userId",
        checkoutCache:
          "userId",
        offlineOrders:
          "id,userId,status,createdAt",
        posSales:
          "id,userId,status,cashSessionId,warehouseId,createdAt",
      });
  }
}

export const offlineDb =
  new VeloraOfflineDatabase();

export const offlineCache = {
  saveCart: (
    userId: string,
    cart: CartResponse,
  ) =>
    offlineDb.cartCache.put({
      userId,
      cart,
      updatedAt:
        new Date().toISOString(),
    }),

  readCart: async (
    userId: string,
  ) =>
    (
      await offlineDb.cartCache.get(
        userId,
      )
    )?.cart ?? null,

  saveCheckout: (
    userId: string,
    warehouses: CheckoutWarehouseResponse[],
    addresses: CustomerAddressResponse[],
  ) =>
    offlineDb.checkoutCache.put({
      userId,
      warehouses,
      addresses,
      updatedAt:
        new Date().toISOString(),
    }),

  readCheckout: async (
    userId: string,
  ) =>
    await offlineDb.checkoutCache.get(
      userId,
    ) ?? null,

  queueOrder: (
    entry: OfflineOrderEntry,
  ) =>
    offlineDb.offlineOrders.put(
      entry,
    ),

  orders: (
    userId: string,
  ) =>
    offlineDb.offlineOrders
      .where("userId")
      .equals(userId)
      .reverse()
      .sortBy("createdAt"),

  discardOrder: (
    id: string,
  ) =>
    offlineDb.offlineOrders.delete(
      id,
    ),

  retryOrder: (
    id: string,
  ) =>
    offlineDb.offlineOrders.update(
      id,
      {
        status: "PENDING",
        errorMessage: null,
      },
    ),

  queuePosSale: (
    entry: OfflinePosSaleEntry,
  ) =>
    offlineDb.posSales.put(
      entry,
    ),

  posSales: (
    userId: string,
  ) =>
    offlineDb.posSales
      .where("userId")
      .equals(userId)
      .reverse()
      .sortBy("createdAt"),

  discardPosSale: (
    id: string,
  ) =>
    offlineDb.posSales.delete(
      id,
    ),

  retryPosSale: (
    id: string,
  ) =>
    offlineDb.posSales.update(
      id,
      {
        status: "PENDING",
        errorMessage: null,
      },
    ),
};
