package com.velora.cart.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.velora.cart.ShoppingCartItemEntity;

public record CartItemResponse(
        UUID id,
        UUID variantId,
        UUID productId,
        String productName,
        String sku,
        String size,
        String color,
        String colorHex,
        BigDecimal unitPrice,
        String currency,
        int quantity,
        BigDecimal subtotal
) {

    public static CartItemResponse from(ShoppingCartItemEntity item) {
        var variant = item.getVariant();

        BigDecimal subtotal = variant.getPrice()
                .multiply(BigDecimal.valueOf(item.getQuantity()));

        return new CartItemResponse(
                item.getId(),
                variant.getId(),
                variant.getProduct().getId(),
                variant.getProduct().getName(),
                variant.getSku(),
                variant.getSize(),
                variant.getColor(),
                variant.getColorHex(),
                variant.getPrice(),
                variant.getCurrency(),
                item.getQuantity(),
                subtotal
        );
    }
}