export interface Warehouse {
  id: string;
  storeId: string;
  storeName: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface InventoryStock {
  id: string;
  warehouseId: string;
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  physicalQuantity: number;
  committedQuantity: number;
  availableQuantity: number;
  version: number;
}

export interface InventoryMovement {
  id: string;
  warehouseId: string;
  variantId: string;
  sku: string;
  movementType: string;
  quantity: number;
  physicalDelta: number;
  committedDelta: number;
  physicalBefore: number;
  physicalAfter: number;
  committedBefore: number;
  committedAfter: number;
  reason: string;
  performedBy: string | null;
  createdAt: string;
}