package com.velora.payment.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.payment.PaymentEntity;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentStatus;
import com.velora.user.UserEntity;

public record PaymentResponse(
        UUID id,
        UUID orderId,
        String orderNumber,
        UUID storeId,
        String storeName,
        PaymentMethod method,
        PaymentStatus status,
        BigDecimal amount,
        String currency,
        String provider,
        String externalReference,
        String notes,
        UUID processedById,
        String processedByName,
        Instant createdAt,
        Instant paidAt,
        Instant failedAt,
        Instant cancelledAt,
        Instant refundedAt
) {

    public static PaymentResponse from(
            PaymentEntity payment
    ) {
        UserEntity processedBy =
                payment.getProcessedBy();

        return new PaymentResponse(
                payment.getId(),
                payment.getOrder().getId(),
                payment.getOrder().getOrderNumber(),

                payment.getOrder()
                        .getWarehouse()
                        .getStore()
                        .getId(),

                payment.getOrder()
                        .getWarehouse()
                        .getStore()
                        .getName(),

                payment.getMethod(),
                payment.getStatus(),
                payment.getAmount(),
                payment.getCurrency(),

                payment.getProvider(),
                payment.getExternalReference(),
                payment.getNotes(),

                processedBy == null
                        ? null
                        : processedBy.getId(),

                processedBy == null
                        ? null
                        : processedBy.getFirstName()
                                + " "
                                + processedBy.getLastName(),

                payment.getCreatedAt(),
                payment.getPaidAt(),
                payment.getFailedAt(),
                payment.getCancelledAt(),
                payment.getRefundedAt()
        );
    }
}