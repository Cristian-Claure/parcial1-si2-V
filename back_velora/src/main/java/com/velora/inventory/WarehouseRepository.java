package com.velora.inventory;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WarehouseRepository
        extends JpaRepository<WarehouseEntity, UUID> {

    boolean existsByStore_IdAndCodeIgnoreCase(
            UUID storeId,
            String code
    );

    List<WarehouseEntity> findAllByStore_IdOrderByNameAsc(
            UUID storeId
    );

    List<WarehouseEntity> findAllByOrderByNameAsc();
}