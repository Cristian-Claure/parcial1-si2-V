package com.velora.customer.dto;

import java.time.Instant;
import java.util.UUID;

import com.velora.customer.CustomerFavoriteEntity;

public record CustomerFavoriteResponse(
        UUID id,
        UUID productId,
        Instant createdAt
) {

    public static CustomerFavoriteResponse from(
            CustomerFavoriteEntity favorite
    ) {
        return new CustomerFavoriteResponse(
                favorite.getId(),
                favorite.getProduct().getId(),
                favorite.getCreatedAt()
        );
    }
}