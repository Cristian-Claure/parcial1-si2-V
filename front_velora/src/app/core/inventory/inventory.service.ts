import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import {
  InventoryMovement,
  InventoryStock,
  Warehouse
} from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);

  warehouses() {
    return this.http.get<Warehouse[]>('/api/inventory/warehouses');
  }

  createWarehouse(payload: {
    storeId: string;
    code: string;
    name: string;
    description: string | null;
    active: boolean;
  }) {
    return this.http.post<Warehouse>('/api/inventory/warehouses', payload);
  }

  stock(warehouseId: string) {
    return this.http.get<InventoryStock[]>(
      `/api/inventory/warehouses/${warehouseId}/stock`
    );
  }

  movements(warehouseId: string) {
    return this.http.get<InventoryMovement[]>(
      `/api/inventory/warehouses/${warehouseId}/movements`
    );
  }

  registerMovement(payload: {
    warehouseId: string;
    variantId: string;
    movementType: string;
    quantity: number;
    reason: string;
    referenceType: string | null;
    referenceId: string | null;
  }) {
    return this.http.post<InventoryStock>('/api/inventory/movements', payload);
  }
}