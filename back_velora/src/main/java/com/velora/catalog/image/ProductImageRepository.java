package com.velora.catalog.image;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductImageRepository extends JpaRepository<ProductImageEntity, UUID> {
    List<ProductImageEntity> findAllByProductIdOrderBySortOrderAsc(UUID productId);

    List<ProductImageEntity> findAllByProductIdAndPurposeOrderBySortOrderAsc(
            UUID productId,
            ProductImagePurpose purpose
    );

    List<ProductImageEntity> findAllByProductIdAndVariantIdAndPurposeOrderBySortOrderAsc(
            UUID productId,
            UUID variantId,
            ProductImagePurpose purpose
    );
}