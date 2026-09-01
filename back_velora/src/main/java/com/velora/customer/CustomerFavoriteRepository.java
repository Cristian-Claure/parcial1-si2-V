package com.velora.customer;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerFavoriteRepository
        extends JpaRepository<CustomerFavoriteEntity, UUID> {

    List<CustomerFavoriteEntity>
        findAllByCustomerIdOrderByCreatedAtDesc(
                UUID customerId
        );

    Optional<CustomerFavoriteEntity>
        findByCustomerIdAndProductId(
                UUID customerId,
                UUID productId
        );

    boolean existsByCustomerIdAndProductId(
            UUID customerId,
            UUID productId
    );
}