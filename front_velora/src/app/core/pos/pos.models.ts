export type CashSessionStatus =
  | 'OPEN'
  | 'CLOSED';

export type CashMovementType =
  | 'CASH_IN'
  | 'CASH_OUT';

export type PosPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'QR';

export type PosPaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PosOrderStatus =
  | 'RESERVED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface PointOfSale {
  id: string;

  storeId: string;
  storeName: string;

  warehouseId: string;
  warehouseName: string;

  code: string;
  name: string;

  active: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface CashSession {
  id: string;
  sessionNumber: string;

  pointOfSaleId: string;
  pointOfSaleCode: string;
  pointOfSaleName: string;

  storeId: string;
  storeName: string;

  warehouseId: string;
  warehouseName: string;

  openedBy: string;
  closedBy: string | null;

  status: CashSessionStatus;
  currency: string;

  openingAmount: number;
  expectedCashAmount: number;
  countedCashAmount: number | null;
  cashDifference: number | null;

  openingNotes: string | null;
  closingNotes: string | null;

  openedAt: string;
  closedAt: string | null;

  version: number;
}

export interface OpenCashSessionPayload {
  pointOfSaleId: string;
  openingAmount: number;
  openingNotes: string | null;
}

export interface CloseCashSessionPayload {
  countedCashAmount: number;
  closingNotes: string | null;
}

export interface CashMovement {
  id: string;

  cashSessionId: string;
  sessionNumber: string;

  movementType: CashMovementType;
  amount: number;
  reason: string;

  createdBy: string;
  createdAt: string;
}

export interface CashMovementPayload {
  movementType: CashMovementType;
  amount: number;
  reason: string;
}

export interface PosSaleItemPayload {
  variantId: string;
  quantity: number;
}

export interface CreatePosSalePayload {
  clientOperationId: string;
  clientCreatedAt: string | null;

  cashSessionId: string;
  customerId: string | null;

  paymentMethod: PosPaymentMethod;

  items: PosSaleItemPayload[];

  notes: string | null;
}

export interface PosSaleItem {
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

export interface PosSale {
  orderId: string;
  orderNumber: string;

  clientOperationId: string;
  clientCreatedAt: string | null;
  syncedAt: string;

  orderChannel: 'POS';
  orderStatus: PosOrderStatus;

  pointOfSaleId: string;
  pointOfSaleCode: string;

  cashSessionId: string;
  cashSessionNumber: string;

  customerId: string | null;

  paymentMethod: PosPaymentMethod;

  paymentId: string;
  paymentStatus: PosPaymentStatus;

  currency: string;

  subtotal: number;
  total: number;

  createdAt: string;

  items: PosSaleItem[];
}

export interface PosPaymentConfirmation {
  orderId: string;
  orderNumber: string;

  orderStatus: PosOrderStatus;

  paymentId: string;
  paymentMethod: PosPaymentMethod;
  paymentStatus: PosPaymentStatus;

  total: number;
  currency: string;

  fulfilledAt: string | null;
}

export interface PosPaymentResolution {
  orderId: string;
  orderNumber: string;

  orderStatus: PosOrderStatus;

  paymentId: string;
  paymentMethod: PosPaymentMethod;
  paymentStatus: PosPaymentStatus;

  total: number;
  currency: string;

  resolvedAt: string;
}