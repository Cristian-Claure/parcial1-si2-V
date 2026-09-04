package com.velora.catalog.dto;

import java.util.UUID;

import com.velora.catalog.image.ProductImagePurpose;

public record ImageResponse(
        UUID id,
        UUID variantId,
        String imageUrl,
        String altText,
        ProductImagePurpose purpose,
        int sortOrder,
        boolean primary
) {}