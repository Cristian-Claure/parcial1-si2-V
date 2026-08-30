package com.velora.inventory.dto;

import java.util.UUID;

import com.velora.inventory.InventoryMovementType;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InventoryMovementRequest(
        @NotNull UUID warehouseId,
        @NotNull UUID variantId,
        @NotNull InventoryMovementType movementType,
        @Min(1) int quantity,
        @NotBlank @Size(max = 500) String reason,
        @Size(max = 40) String referenceType,
        UUID referenceId
) {}