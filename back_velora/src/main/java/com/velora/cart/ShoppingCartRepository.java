package com.velora.cart;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShoppingCartRepository
        extends JpaRepository<ShoppingCartEntity, UUID> {

    Optional<ShoppingCartEntity> findByUserIdAndStatus(
            UUID userId,
            CartStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c
        from ShoppingCartEntity c
        where c.user.id = :userId
          and c.status = :status
    """)
    Optional<ShoppingCartEntity> findForUpdateByUserAndStatus(
            @Param("userId") UUID userId,
            @Param("status") CartStatus status
    );
}