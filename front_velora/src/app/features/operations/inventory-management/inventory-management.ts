import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { RoleShell } from '../../../shared/role-shell/role-shell';

import { Product } from '../../../core/catalog/catalog.models';
import { CatalogService } from '../../../core/catalog/catalog.service';
import {
  InventoryMovement,
  InventoryStock,
  Warehouse
} from '../../../core/inventory/inventory.models';
import { InventoryService } from '../../../core/inventory/inventory.service';

@Component({
  selector: 'app-inventory-management',
  standalone: true,
  imports: [ReactiveFormsModule, RoleShell],
  templateUrl: './inventory-management.html',
  styleUrl: './inventory-management.scss'
})
export class InventoryManagement {
  private readonly inventory = inject(InventoryService);
  private readonly catalog = inject(CatalogService);
  private readonly fb = inject(FormBuilder);

  readonly warehouses = signal<Warehouse[]>([]);
  readonly products = signal<Product[]>([]);
  readonly stock = signal<InventoryStock[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);

  readonly selectedWarehouseId = signal('');
  readonly message = signal('');
  readonly error = signal('');

  readonly movementForm = this.fb.nonNullable.group({
    warehouseId: ['', Validators.required],
    variantId: ['', Validators.required],
    movementType: ['ENTRY', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    reason: ['', Validators.required]
  });

  constructor() {
    this.reload();
  }

  selectWarehouse(warehouseId: string): void {
    this.selectedWarehouseId.set(warehouseId);

    this.movementForm.patchValue({
      warehouseId
    });

    this.inventory.stock(warehouseId).subscribe({
      next: (stock) => this.stock.set(stock)
    });

    this.inventory.movements(warehouseId).subscribe({
      next: (movements) => this.movements.set(movements)
    });
  }

  registerMovement(): void {
    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }

    const value = this.movementForm.getRawValue();

    this.clearFeedback();

    this.inventory.registerMovement({
      warehouseId: value.warehouseId,
      variantId: value.variantId,
      movementType: value.movementType,
      quantity: Number(value.quantity),
      reason: value.reason.trim(),
      referenceType: 'WEB_INVENTORY',
      referenceId: null
    }).subscribe({
      next: () => {
        this.message.set('Movimiento registrado correctamente.');

        this.movementForm.patchValue({
          variantId: '',
          movementType: 'ENTRY',
          quantity: 1,
          reason: ''
        });

        this.selectWarehouse(value.warehouseId);
      },
      error: (error: HttpErrorResponse) => this.handleError(error)
    });
  }

  allVariants() {
    return this.products().flatMap((product) =>
      product.variants
        .filter((variant) => variant.active)
        .map((variant) => ({
          id: variant.id,
          label:
            `${product.name} · ${variant.color} · ` +
            `${variant.size} · ${variant.sku}`
        }))
    );
  }

  private reload(): void {
    this.inventory.warehouses().subscribe({
      next: (warehouses) => {
        this.warehouses.set(warehouses);

        if (warehouses.length > 0) {
          this.selectWarehouse(warehouses[0].id);
        }
      }
    });

    this.catalog.managedProducts().subscribe({
      next: (products) => this.products.set(products)
    });
  }

  private clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }

  private handleError(error: HttpErrorResponse): void {
    this.error.set(
      error.error?.message ??
      'No se pudo completar la operación.'
    );
  }
}