package com.velora.catalog.category;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<CategoryEntity, UUID> {
    boolean existsBySlugIgnoreCase(String slug);
    List<CategoryEntity> findAllByActiveTrueOrderByNameAsc();
    List<CategoryEntity> findAllByOrderByNameAsc();
}