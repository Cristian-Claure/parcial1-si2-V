package com.velora.push.dto;

import java.time.Instant;
import java.util.UUID;

import com.velora.push.PushInstallationEntity;
import com.velora.push.PushPlatform;

public record PushInstallationResponse(
        UUID id,
        PushPlatform platform,
        String deviceLabel,
        boolean active,
        Instant lastSeenAt
) {

    public static PushInstallationResponse from(
            PushInstallationEntity entity
    ) {
        return new PushInstallationResponse(
                entity.getId(),
                entity.getPlatform(),
                entity.getDeviceLabel(),
                entity.isActive(),
                entity.getLastSeenAt()
        );
    }
}
