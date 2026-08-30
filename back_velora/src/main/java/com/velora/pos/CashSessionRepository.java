package com.velora.pos;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CashSessionRepository
        extends JpaRepository<CashSessionEntity, UUID> {

    Optional<CashSessionEntity>
    findByPointOfSale_IdAndStatus(
            UUID pointOfSaleId,
            CashSessionStatus status
    );

    boolean existsByPointOfSale_IdAndStatus(
            UUID pointOfSaleId,
            CashSessionStatus status
    );

    List<CashSessionEntity>
    findAllByPointOfSale_IdOrderByOpenedAtDesc(
            UUID pointOfSaleId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select s
        from CashSessionEntity s
        where s.id = :id
    """)
    Optional<CashSessionEntity>
    findForUpdateById(
            @Param("id") UUID id
    );
}