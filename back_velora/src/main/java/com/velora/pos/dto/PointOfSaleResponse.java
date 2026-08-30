package com.velora.pos.dto;

import java.time.Instant;
import java.util.UUID;

import com.velora.pos.PointOfSaleEntity;

public record PointOfSaleResponse(
        UUID id,
        UUID storeId,
        String storeName,
        UUID warehouseId,
        String warehouseName,
        String code,
        String name,
        boolean active,
        Instant createdAt,
        Instant updatedAt
) {

    public static PointOfSaleResponse from(
            PointOfSaleEntity entity
    ) {
        return new PointOfSaleResponse(
                entity.getId(),
                entity.getStore().getId(),
                entity.getStore().getName(),
                entity.getWarehouse().getId(),
                entity.getWarehouse().getName(),
                entity.getCode(),
                entity.getName(),
                entity.isActive(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}