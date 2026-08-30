package com.velora.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateStoreRequest(
        @NotBlank(message = "El código de sucursal es obligatorio.")
        @Size(max = 40)
        String code,

        @NotBlank(message = "El nombre de la sucursal es obligatorio.")
        @Size(max = 120)
        String name,

        @Size(max = 240)
        String address
) {}
