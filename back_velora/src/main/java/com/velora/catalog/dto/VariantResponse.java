package com.velora.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record VariantResponse(
        UUID id,
        String sku,
        String barcode,
        String size,
        String color,
        String colorHex,
        BigDecimal price,
        BigDecimal compareAtPrice,
        String currency,
        boolean active
) {}