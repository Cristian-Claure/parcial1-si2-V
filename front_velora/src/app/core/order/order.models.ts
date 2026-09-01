export type FulfillmentType =
  | 'DELIVERY'
  | 'PICKUP'
  | 'IN_STORE';

export type OrderStatus =
  | 'RESERVED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface CheckoutWarehouse {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  storeId: string;
  storeName: string;
  storeAddress: string | null;
}

export interface CreateOrderPayload {
  warehouseId: string;
  fulfillmentType:
    | 'DELIVERY'
    | 'PICKUP';
  addressId: string | null;
  notes: string | null;
}

export interface SyncOfflineOrderItemPayload {
  variantId: string;
  quantity: number;
}

export interface SyncOfflineOrderPayload {
  clientOperationId: string;
  clientCreatedAt: string;
  sourceCartId: string | null;

  warehouseId: string;

  fulfillmentType:
    | 'DELIVERY'
    | 'PICKUP';

  addressId: string | null;
  notes: string | null;

  items: SyncOfflineOrderItemPayload[];
}
export interface OrderItem {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;

  warehouseId: string;
  storeId: string;
  storeName: string;

  fulfillmentType: FulfillmentType;
  status: OrderStatus;

  currency: string;
  subtotal: number;
  total: number;

  recipientName: string | null;
  recipientPhone: string | null;

  department: string | null;
  city: string | null;
  zone: string | null;

  addressLine: string | null;
  addressReference: string | null;

  notes: string | null;

  createdAt: string;
  cancelledAt: string | null;
  fulfilledAt: string | null;

  items: OrderItem[];
}