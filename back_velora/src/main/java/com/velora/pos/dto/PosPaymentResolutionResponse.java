package com.velora.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.order.OrderStatus;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentStatus;

public record PosPaymentResolutionResponse(
        UUID orderId,
        String orderNumber,
        OrderStatus orderStatus,
        UUID paymentId,
        PaymentMethod paymentMethod,
        PaymentStatus paymentStatus,
        BigDecimal total,
        String currency,
        Instant resolvedAt
) {}