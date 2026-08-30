package com.velora.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.pos.CashSessionEntity;
import com.velora.pos.CashSessionStatus;

public record CashSessionResponse(
        UUID id,
        String sessionNumber,
        UUID pointOfSaleId,
        String pointOfSaleCode,
        String pointOfSaleName,
        UUID storeId,
        String storeName,
        UUID warehouseId,
        String warehouseName,
        UUID openedBy,
        UUID closedBy,
        CashSessionStatus status,
        String currency,
        BigDecimal openingAmount,
        BigDecimal expectedCashAmount,
        BigDecimal countedCashAmount,
        BigDecimal cashDifference,
        String openingNotes,
        String closingNotes,
        Instant openedAt,
        Instant closedAt,
        long version
) {

    public static CashSessionResponse from(
            CashSessionEntity entity
    ) {
        return new CashSessionResponse(
                entity.getId(),
                entity.getSessionNumber(),
                entity.getPointOfSale().getId(),
                entity.getPointOfSale().getCode(),
                entity.getPointOfSale().getName(),
                entity.getPointOfSale().getStore().getId(),
                entity.getPointOfSale().getStore().getName(),
                entity.getPointOfSale().getWarehouse().getId(),
                entity.getPointOfSale().getWarehouse().getName(),
                entity.getOpenedBy().getId(),
                entity.getClosedBy() == null
                        ? null
                        : entity.getClosedBy().getId(),
                entity.getStatus(),
                entity.getCurrency(),
                entity.getOpeningAmount(),
                entity.getExpectedCashAmount(),
                entity.getCountedCashAmount(),
                entity.getCashDifference(),
                entity.getOpeningNotes(),
                entity.getClosingNotes(),
                entity.getOpenedAt(),
                entity.getClosedAt(),
                entity.getVersion()
        );
    }
}