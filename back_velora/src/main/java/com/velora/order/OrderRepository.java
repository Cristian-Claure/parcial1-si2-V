package com.velora.order;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository
        extends JpaRepository<OrderEntity, UUID> {

    List<OrderEntity> findAllByCustomerIdOrderByCreatedAtDesc(
            UUID customerId
    );

    Optional<OrderEntity> findByIdAndCustomerId(
            UUID id,
            UUID customerId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select o
        from OrderEntity o
        where o.id = :orderId
    """)
    Optional<OrderEntity> findForUpdateById(
            @Param("orderId") UUID orderId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select o
        from OrderEntity o
        where o.id = :orderId
          and o.customer.id = :customerId
    """)
    Optional<OrderEntity> findForUpdateByIdAndCustomer(
            @Param("orderId") UUID orderId,
            @Param("customerId") UUID customerId
    );
    Optional<OrderEntity> findByClientOperationId(
            UUID clientOperationId
    );
}