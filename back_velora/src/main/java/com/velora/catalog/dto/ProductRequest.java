package com.velora.catalog.dto;

import java.util.UUID;

import com.velora.catalog.product.ProductStatus;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProductRequest(
        @NotNull
        UUID categoryId,

        @NotBlank
        @Size(max = 180)
        String name,

        @NotBlank
        @Size(max = 200)
        String slug,

        String description,

        @Size(max = 120)
        String brand,

        @Size(max = 500)
        String composition,

        @Size(max = 1000)
        String careInstructions,

        @Size(max = 500)
        String fitNotes,

        ProductStatus status
) {}