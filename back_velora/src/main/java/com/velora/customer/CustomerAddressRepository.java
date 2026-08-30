package com.velora.customer;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerAddressRepository
        extends JpaRepository<CustomerAddressEntity, UUID> {

    List<CustomerAddressEntity>
        findAllByUserIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(UUID userId);

    Optional<CustomerAddressEntity>
        findByIdAndUserIdAndActiveTrue(UUID id, UUID userId);
}