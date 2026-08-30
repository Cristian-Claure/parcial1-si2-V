package com.velora.cart.dto;

import jakarta.validation.constraints.*;

public record UpdateCartItemRequest(

        @Min(value = 1, message = "La cantidad mínima es 1.")
        @Max(value = 99, message = "La cantidad máxima por producto es 99.")
        int quantity
) {}