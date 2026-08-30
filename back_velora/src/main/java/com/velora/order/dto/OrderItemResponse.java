package com.velora.order.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.velora.order.OrderItemEntity;

public record OrderItemResponse(
        UUID id,
        UUID variantId,
        String productName,
        String sku,
        String size,
        String color,
        BigDecimal unitPrice,
        String currency,
        int quantity,
        BigDecimal subtotal
) {

    public static OrderItemResponse from(OrderItemEntity item) {
        return new OrderItemResponse(
                item.getId(),
                item.getVariant().getId(),
                item.getProductName(),
                item.getSku(),
                item.getSize(),
                item.getColor(),
                item.getUnitPrice(),
                item.getCurrency(),
                item.getQuantity(),
                item.getSubtotal()
        );
    }
}