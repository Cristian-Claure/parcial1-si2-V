package com.velora.cart.dto;

import java.util.UUID;

import jakarta.validation.constraints.*;

public record AddCartItemRequest(

        @NotNull(message = "La variante es obligatoria.")
        UUID variantId,

        @Min(value = 1, message = "La cantidad mínima es 1.")
        @Max(value = 99, message = "La cantidad máxima por producto es 99.")
        int quantity
) {}