package com.velora.order.dto;

import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record OfflineOrderItemRequest(

        @NotNull(message = "La variante es obligatoria.")
        UUID variantId,

        @Min(
                value = 1,
                message = "La cantidad debe ser mayor a cero."
        )
        @Max(
                value = 999,
                message = "La cantidad solicitada es demasiado alta."
        )
        int quantity
) {}
