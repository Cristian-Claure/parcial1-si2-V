package com.velora.order.operations.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.order.FulfillmentType;
import com.velora.order.OrderChannel;
import com.velora.order.OrderStatus;
import com.velora.payment.dto.PaymentResponse;

public record OperationalOrderResponse(
        UUID id,
        String orderNumber,

        UUID customerId,
        String customerName,
        String customerEmail,

        UUID storeId,
        String storeName,

        UUID warehouseId,
        String warehouseName,

        OrderChannel orderChannel,
        FulfillmentType fulfillmentType,
        OrderStatus status,

        String currency,
        BigDecimal total,

        Instant createdAt,
        Instant fulfilledAt,
        Instant cancelledAt,

        List<PaymentResponse> payments
) {}