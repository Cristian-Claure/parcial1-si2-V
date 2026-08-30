package com.velora.catalog.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record VariantRequest(
        @NotBlank
        @Size(max = 80)
        String sku,

        @Size(max = 100)
        String barcode,

        @NotBlank
        @Size(max = 30)
        String size,

        @NotBlank
        @Size(max = 80)
        String color,

        @Size(max = 7)
        String colorHex,

        @NotNull
        @DecimalMin("0.00")
        BigDecimal price,

        @DecimalMin("0.00")
        BigDecimal compareAtPrice,

        @Size(min = 3, max = 3)
        String currency,

        Boolean active
) {}