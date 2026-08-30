package com.velora.pos.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdatePointOfSaleRequest(

        @NotNull(message = "El almacén es obligatorio.")
        UUID warehouseId,

        @NotBlank(message = "El código es obligatorio.")
        @Size(max = 40, message = "El código es demasiado largo.")
        String code,

        @NotBlank(message = "El nombre es obligatorio.")
        @Size(max = 120, message = "El nombre es demasiado largo.")
        String name,

        boolean active
) {}