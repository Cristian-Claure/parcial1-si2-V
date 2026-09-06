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

    @Query("""
        select o
        from OrderEntity o
        join fetch o.warehouse w
        join fetch w.store s
        order by o.createdAt desc
    """)
    List<OrderEntity> findOperationalAdminOrderByCreatedAtDesc();

    @Query("""
        select o
        from OrderEntity o
        join fetch o.warehouse w
        join fetch w.store s
        where s.id = :storeId
        order by o.createdAt desc
    """)
    List<OrderEntity> findOperationalByStoreIdOrderByCreatedAtDesc(
            @Param("storeId") UUID storeId
    );

    @Query("""
        select o
        from OrderEntity o
        join fetch o.warehouse w
        join fetch w.store s
    """)
    List<OrderEntity> findForReportAll();

    @Query("""
        select o
        from OrderEntity o
        join fetch o.warehouse w
        join fetch w.store s
        where s.id = :storeId
    """)
    List<OrderEntity> findForReportStore(
            @Param("storeId") UUID storeId
    );

    @Query("""
        select min(o.createdAt)
        from OrderEntity o
    """)
    java.time.Instant findMinCreatedAtForReportAll();

    @Query("""
        select min(o.createdAt)
        from OrderEntity o
        where o.warehouse.store.id = :storeId
    """)
    java.time.Instant findMinCreatedAtForReportStore(
            @Param("storeId") UUID storeId
    );
}