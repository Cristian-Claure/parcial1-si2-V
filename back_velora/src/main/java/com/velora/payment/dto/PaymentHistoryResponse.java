package com.velora.payment.dto;

import java.time.Instant;
import java.util.UUID;

import com.velora.payment.PaymentStatus;
import com.velora.payment.PaymentStatusHistoryEntity;
import com.velora.user.UserEntity;

public record PaymentHistoryResponse(
        UUID id,
        PaymentStatus fromStatus,
        PaymentStatus toStatus,
        UUID changedById,
        String changedByName,
        String reason,
        Instant createdAt
) {

    public static PaymentHistoryResponse from(
            PaymentStatusHistoryEntity history
    ) {
        UserEntity actor = history.getChangedBy();

        return new PaymentHistoryResponse(
                history.getId(),
                history.getFromStatus(),
                history.getToStatus(),
                actor.getId(),
                actor.getFirstName() + " " + actor.getLastName(),
                history.getReason(),
                history.getCreatedAt()
        );
    }
}