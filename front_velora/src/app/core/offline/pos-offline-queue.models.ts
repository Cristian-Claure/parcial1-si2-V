import {
  CreatePosSalePayload
} from '../pos/pos.models';

export type OfflinePosSaleStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'CONFLICT';

export interface OfflinePosSaleItemSnapshot {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface QueueOfflinePosSaleInput {
  pointOfSaleId: string;
  warehouseId: string;
  cashSessionId: string;
  payload: CreatePosSalePayload;
  items: OfflinePosSaleItemSnapshot[];
  total: number;
  currency: string;
}

export interface OfflinePosSaleEntry {
  clientOperationId: string;
  pointOfSaleId: string;
  warehouseId: string;
  cashSessionId: string;

  payload: CreatePosSalePayload;
  items: OfflinePosSaleItemSnapshot[];

  total: number;
  currency: string;

  status: OfflinePosSaleStatus;

  attempts: number;

  queuedAt: string;

  lastAttemptAt: string | null;

  lastError: string | null;
}