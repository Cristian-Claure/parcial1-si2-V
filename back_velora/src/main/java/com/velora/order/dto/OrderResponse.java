package com.velora.order.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.order.*;

public record OrderResponse(
        UUID id,
        String orderNumber,
        UUID warehouseId,
        UUID storeId,
        String storeName,
        FulfillmentType fulfillmentType,
        OrderStatus status,
        String currency,
        BigDecimal subtotal,
        BigDecimal total,
        String recipientName,
        String recipientPhone,
        String department,
        String city,
        String zone,
        String addressLine,
        String addressReference,
        String notes,
        Instant createdAt,
        Instant cancelledAt,
        Instant fulfilledAt,
        List<OrderItemResponse> items
) {}