package com.velora.inventory;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InventoryMovementRepository
        extends JpaRepository<InventoryMovementEntity, UUID> {

    @Query("""
        select m
        from InventoryMovementEntity m
        join fetch m.variant v
        join fetch v.product
        join fetch m.performedBy
        where m.warehouse.id = :warehouseId
        order by m.createdAt desc
    """)
    List<InventoryMovementEntity> findHistory(
            @Param("warehouseId") UUID warehouseId
    );
}