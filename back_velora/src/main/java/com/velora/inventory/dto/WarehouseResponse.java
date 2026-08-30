package com.velora.inventory.dto;

import java.util.UUID;

public record WarehouseResponse(
        UUID id,
        UUID storeId,
        String storeName,
        String code,
        String name,
        String description,
        boolean active
) {}