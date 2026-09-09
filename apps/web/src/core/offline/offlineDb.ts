import Dexie, { type EntityTable } from "dexie";
import type { CartResponse, CheckoutWarehouseResponse, CustomerAddressResponse, SyncOfflineOrderRequest } from "@velora/contracts";

export type OfflineOrderStatus = "PENDING" | "CONFLICT";
export interface OfflineOrderEntry {
  id: string; userId: string; status: OfflineOrderStatus; request: SyncOfflineOrderRequest;
  createdAt: string; errorMessage: string | null;
}
interface CartCache { userId: string; cart: CartResponse; updatedAt: string; }
interface CheckoutCache { userId: string; warehouses: CheckoutWarehouseResponse[]; addresses: CustomerAddressResponse[]; updatedAt: string; }

class VeloraOfflineDatabase extends Dexie {
  cartCache!: EntityTable<CartCache, "userId">;
  checkoutCache!: EntityTable<CheckoutCache, "userId">;
  offlineOrders!: EntityTable<OfflineOrderEntry, "id">;
  constructor() {
    super("velora-customer-v2");
    this.version(1).stores({ cartCache: "userId", checkoutCache: "userId", offlineOrders: "id,userId,status,createdAt" });
  }
}
export const offlineDb = new VeloraOfflineDatabase();

export const offlineCache = {
  saveCart: (userId: string, cart: CartResponse) => offlineDb.cartCache.put({ userId, cart, updatedAt: new Date().toISOString() }),
  readCart: async (userId: string) => (await offlineDb.cartCache.get(userId))?.cart ?? null,
  saveCheckout: (userId: string, warehouses: CheckoutWarehouseResponse[], addresses: CustomerAddressResponse[]) => offlineDb.checkoutCache.put({ userId, warehouses, addresses, updatedAt: new Date().toISOString() }),
  readCheckout: async (userId: string) => await offlineDb.checkoutCache.get(userId) ?? null,
  queueOrder: (entry: OfflineOrderEntry) => offlineDb.offlineOrders.put(entry),
  orders: (userId: string) => offlineDb.offlineOrders.where("userId").equals(userId).reverse().sortBy("createdAt"),
  discardOrder: (id: string) => offlineDb.offlineOrders.delete(id),
  retryOrder: (id: string) => offlineDb.offlineOrders.update(id, { status: "PENDING", errorMessage: null }),
};
