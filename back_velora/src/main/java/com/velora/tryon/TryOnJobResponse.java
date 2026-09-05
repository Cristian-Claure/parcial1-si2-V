package com.velora.tryon;

import java.time.Instant;
import java.util.UUID;

public record TryOnJobResponse(
        UUID id,
        UUID productId,
        UUID variantId,
        String provider,
        String status,
        String resultUrl,
        String error,
        Long durationMs,
        Instant createdAt,
        Instant updatedAt,
        Instant completedAt
) {}
