import {
  SyncOfflineOrderPayload
} from '../order/order.models';

export type CustomerOfflineOrderStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'CONFLICT';

export interface CustomerOfflineDisplayItem {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface CustomerOfflineOrderEntry {
  customerId: string;
  clientOperationId: string;
  payload: SyncOfflineOrderPayload;
  displayItems: CustomerOfflineDisplayItem[];
  status: CustomerOfflineOrderStatus;
  conflictMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
