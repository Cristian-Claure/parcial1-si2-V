package com.velora.catalog.variant;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductVariantRepository extends JpaRepository<ProductVariantEntity, UUID> {
    boolean existsBySkuIgnoreCase(String sku);
    List<ProductVariantEntity> findAllByProductIdOrderByColorAscSizeAsc(UUID productId);
}