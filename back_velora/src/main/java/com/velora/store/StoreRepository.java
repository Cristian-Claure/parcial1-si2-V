package com.velora.store;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<StoreEntity, UUID> {
    boolean existsByCodeIgnoreCase(String code);
    List<StoreEntity> findAllByOrderByNameAsc();
}
