package com.velora.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.pos.CashMovementEntity;
import com.velora.pos.CashMovementType;

public record CashMovementResponse(
        UUID id,
        UUID cashSessionId,
        String sessionNumber,
        CashMovementType movementType,
        BigDecimal amount,
        String reason,
        UUID createdBy,
        Instant createdAt
) {

    public static CashMovementResponse from(
            CashMovementEntity entity
    ) {
        return new CashMovementResponse(
                entity.getId(),
                entity.getCashSession().getId(),
                entity.getCashSession().getSessionNumber(),
                entity.getMovementType(),
                entity.getAmount(),
                entity.getReason(),
                entity.getCreatedBy().getId(),
                entity.getCreatedAt()
        );
    }
}