package com.velora.admin.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;

public record CreateManagerRequest(
        @NotBlank(message = "El nombre es obligatorio.")
        String firstName,

        @NotBlank(message = "El apellido es obligatorio.")
        String lastName,

        @NotBlank(message = "El correo es obligatorio.")
        @Email(message = "Ingrese un correo válido.")
        String email,

        @NotBlank(message = "La contraseña temporal es obligatoria.")
        @Size(min = 8, max = 72)
        @Pattern(
                regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$",
                message = "La contraseña debe incluir mayúscula, minúscula y número."
        )
        String password,

        @NotNull(message = "Debe asignar una sucursal.")
        UUID storeId
) {}
