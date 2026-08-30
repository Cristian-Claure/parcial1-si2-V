package com.velora.pos.dto;

import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PosSaleItemRequest(

        @NotNull(message = "La variante es obligatoria.")
        UUID variantId,

        @Min(
                value = 1,
                message = "La cantidad debe ser mayor a cero."
        )
        @Max(
                value = 99,
                message = "La cantidad máxima por línea es 99."
        )
        int quantity
) {}