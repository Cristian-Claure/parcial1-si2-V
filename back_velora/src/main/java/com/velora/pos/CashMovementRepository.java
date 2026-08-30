package com.velora.pos;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CashMovementRepository
        extends JpaRepository<CashMovementEntity, UUID> {

    List<CashMovementEntity>
    findAllByCashSession_IdOrderByCreatedAtAsc(
            UUID cashSessionId
    );
}