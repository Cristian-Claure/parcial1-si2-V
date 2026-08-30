package com.velora.catalog.dto;

import java.util.UUID;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ImageRequest(
        UUID variantId,

        @NotBlank
        @Size(max = 1000)
        String imageUrl,

        @Size(max = 250)
        String altText,

        @Min(0)
        Integer sortOrder,

        Boolean primary
) {}