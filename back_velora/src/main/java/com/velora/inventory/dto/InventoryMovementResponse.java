package com.velora.inventory.dto;

import java.time.Instant;
import java.util.UUID;

import com.velora.inventory.InventoryMovementType;

public record InventoryMovementResponse(
        UUID id,
        UUID warehouseId,
        UUID variantId,
        String sku,
        InventoryMovementType movementType,
        int quantity,
        int physicalDelta,
        int committedDelta,
        int physicalBefore,
        int physicalAfter,
        int committedBefore,
        int committedAfter,
        String reason,
        String performedBy,
        Instant createdAt
) {}