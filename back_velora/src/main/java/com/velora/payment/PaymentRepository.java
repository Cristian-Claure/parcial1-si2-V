package com.velora.payment;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository
        extends JpaRepository<PaymentEntity, UUID> {

    List<PaymentEntity>
        findAllByOrderIdOrderByCreatedAtDesc(
                UUID orderId
        );

    boolean existsByOrderIdAndStatus(
            UUID orderId,
            PaymentStatus status
    );

    Optional<PaymentEntity>
        findByOrderIdAndStatus(
                UUID orderId,
                PaymentStatus status
        );

    @Query("""
        select p
        from PaymentEntity p
        where p.id = :paymentId
          and p.order.customer.id = :customerId
    """)
    Optional<PaymentEntity>
        findByIdAndCustomer(
                @Param("paymentId") UUID paymentId,
                @Param("customerId") UUID customerId
        );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select p
        from PaymentEntity p
        where p.id = :paymentId
    """)
    Optional<PaymentEntity>
        findForUpdateById(
                @Param("paymentId") UUID paymentId
        );

    @Query("""
        select coalesce(sum(p.amount), 0)
        from PaymentEntity p
        where p.order.cashSession.id = :cashSessionId
          and p.method = :method
          and p.status = :status
    """)
    BigDecimal sumAmountByCashSessionAndMethodAndStatus(
            @Param("cashSessionId") UUID cashSessionId,
            @Param("method") PaymentMethod method,
            @Param("status") PaymentStatus status
    );

    @Query("""
        select count(p)
        from PaymentEntity p
        where p.order.cashSession.id = :cashSessionId
          and p.status = :status
    """)
    long countByCashSessionAndStatus(
            @Param("cashSessionId") UUID cashSessionId,
            @Param("status") PaymentStatus status
    );
}