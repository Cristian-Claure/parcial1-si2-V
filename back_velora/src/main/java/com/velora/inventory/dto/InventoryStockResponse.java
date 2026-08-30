package com.velora.inventory.dto;

import java.util.UUID;

public record InventoryStockResponse(
        UUID id,
        UUID warehouseId,
        UUID variantId,
        String productName,
        String sku,
        String size,
        String color,
        int physicalQuantity,
        int committedQuantity,
        int availableQuantity,
        long version
) {}