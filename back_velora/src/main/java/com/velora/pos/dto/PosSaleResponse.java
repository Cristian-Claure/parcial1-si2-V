package com.velora.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.order.OrderChannel;
import com.velora.order.OrderStatus;
import com.velora.order.dto.OrderItemResponse;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentStatus;

public record PosSaleResponse(
        UUID orderId,
        String orderNumber,
        UUID clientOperationId,
        Instant clientCreatedAt,
        Instant syncedAt,
        OrderChannel orderChannel,
        OrderStatus orderStatus,
        UUID pointOfSaleId,
        String pointOfSaleCode,
        UUID cashSessionId,
        String cashSessionNumber,
        UUID customerId,
        PaymentMethod paymentMethod,
        UUID paymentId,
        PaymentStatus paymentStatus,
        String currency,
        BigDecimal subtotal,
        BigDecimal total,
        Instant createdAt,
        List<OrderItemResponse> items
) {}