package com.velora.pos;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PointOfSaleRepository
        extends JpaRepository<PointOfSaleEntity, UUID> {

    List<PointOfSaleEntity>
    findAllByStore_IdOrderByNameAsc(
            UUID storeId
    );

    Optional<PointOfSaleEntity>
    findByIdAndStore_Id(
            UUID id,
            UUID storeId
    );

    boolean existsByStore_IdAndCodeIgnoreCase(
            UUID storeId,
            String code
    );
}