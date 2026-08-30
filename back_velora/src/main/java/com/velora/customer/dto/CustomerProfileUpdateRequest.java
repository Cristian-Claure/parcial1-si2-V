package com.velora.customer.dto;

import com.velora.user.CustomerType;

import jakarta.validation.constraints.*;

public record CustomerProfileUpdateRequest(

        @NotBlank(message = "El nombre es obligatorio.")
        @Size(max = 80, message = "El nombre es demasiado largo.")
        String firstName,

        @NotBlank(message = "El apellido es obligatorio.")
        @Size(max = 100, message = "El apellido es demasiado largo.")
        String lastName,

        @Size(max = 40, message = "El teléfono es demasiado largo.")
        String phone,

        @NotNull(message = "El tipo de cliente es obligatorio.")
        CustomerType customerType,

        @Size(max = 160, message = "La razón social es demasiado larga.")
        String businessName,

        @Size(max = 40, message = "El NIT es demasiado largo.")
        String taxId
) {}