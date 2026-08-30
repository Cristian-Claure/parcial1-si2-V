package com.velora.catalog.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(
        @NotBlank
        @Size(max = 120)
        String name,

        @NotBlank
        @Size(max = 140)
        String slug,

        @Size(max = 500)
        String description,

        UUID parentId,

        Boolean active
) {}