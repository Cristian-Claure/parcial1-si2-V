package com.velora.inventory;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface InventoryStockRepository
        extends JpaRepository<InventoryStockEntity, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select s
        from InventoryStockEntity s
        where s.warehouse.id = :warehouseId
          and s.variant.id = :variantId
    """)
    Optional<InventoryStockEntity> findForUpdate(
            @Param("warehouseId") UUID warehouseId,
            @Param("variantId") UUID variantId
    );

    @Query("""
        select s
        from InventoryStockEntity s
        join fetch s.variant v
        join fetch v.product p
        where s.warehouse.id = :warehouseId
        order by p.name, v.color, v.size
    """)
    List<InventoryStockEntity> findAllForWarehouse(
            @Param("warehouseId") UUID warehouseId
    );
}