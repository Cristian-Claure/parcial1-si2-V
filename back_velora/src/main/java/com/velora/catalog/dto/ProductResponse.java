package com.velora.catalog.dto;

import java.util.List;
import java.util.UUID;

import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.product.TryOnCategory;

public record ProductResponse(
        UUID id,
        UUID categoryId,
        String categoryName,
        String name,
        String slug,
        String description,
        String brand,
        String composition,
        String careInstructions,
        String fitNotes,
        ProductStatus status,
        boolean tryOnEnabled,
        TryOnCategory tryOnCategory,
        boolean tryOnReady,
        List<VariantResponse> variants,
        List<ImageResponse> images
) {}