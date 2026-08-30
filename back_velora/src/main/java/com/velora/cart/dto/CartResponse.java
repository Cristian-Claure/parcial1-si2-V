package com.velora.cart.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.velora.cart.CartStatus;

public record CartResponse(
        UUID id,
        CartStatus status,
        List<CartItemResponse> items,
        int totalItems,
        BigDecimal subtotal,
        String currency
) {

    public static CartResponse empty() {
        return new CartResponse(
                null,
                CartStatus.ACTIVE,
                List.of(),
                0,
                BigDecimal.ZERO,
                "BOB"
        );
    }

    public static CartResponse of(
            UUID cartId,
            List<CartItemResponse> items
    ) {
        int totalItems = items.stream()
                .mapToInt(CartItemResponse::quantity)
                .sum();

        BigDecimal subtotal = items.stream()
                .map(CartItemResponse::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new CartResponse(
                cartId,
                CartStatus.ACTIVE,
                items,
                totalItems,
                subtotal,
                "BOB"
        );
    }
}