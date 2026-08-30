package com.velora.catalog.product;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<ProductEntity, UUID> {
    boolean existsBySlugIgnoreCase(String slug);
    List<ProductEntity> findAllByStatusOrderByNameAsc(ProductStatus status);
    List<ProductEntity> findAllByOrderByNameAsc();
}