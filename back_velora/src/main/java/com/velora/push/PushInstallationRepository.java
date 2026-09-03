package com.velora.push;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PushInstallationRepository
        extends JpaRepository<
                PushInstallationEntity,
                UUID
        > {

    Optional<PushInstallationEntity>
            findByPlatformAndInstallationId(
                    PushPlatform platform,
                    String installationId
            );

    Optional<PushInstallationEntity>
            findByUserIdAndPlatformAndInstallationId(
                    UUID userId,
                    PushPlatform platform,
                    String installationId
            );

    List<PushInstallationEntity>
            findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(
                    UUID userId
            );
}
