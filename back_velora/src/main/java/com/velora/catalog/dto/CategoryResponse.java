package com.velora.catalog.dto;

import java.util.UUID;

public record CategoryResponse(
        UUID id,
        UUID parentId,
        String parentName,
        String name,
        String slug,
        String description,
        boolean active
) {}