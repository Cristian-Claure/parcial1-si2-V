package com.velora.admin.dto;

import java.util.UUID;
import com.velora.store.StoreEntity;

public record StoreResponse(
        UUID id,
        String code,
        String name,
        String address,
        boolean active
) {
    public static StoreResponse from(StoreEntity store) {
        return new StoreResponse(
                store.getId(),
                store.getCode(),
                store.getName(),
                store.getAddress(),
                store.isActive()
        );
    }
}
