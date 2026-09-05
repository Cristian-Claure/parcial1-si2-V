package com.velora.tryon;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TryOnJobRepository
        extends JpaRepository<TryOnJobEntity, UUID> {

    Optional<TryOnJobEntity> findByIdAndUserId(
            UUID id,
            UUID userId
    );
}
