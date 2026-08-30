package com.velora.catalog.dto;

import java.util.UUID;

public record ImageResponse(
        UUID id,
        UUID variantId,
        String imageUrl,
        String altText,
        int sortOrder,
        boolean primary
) {}