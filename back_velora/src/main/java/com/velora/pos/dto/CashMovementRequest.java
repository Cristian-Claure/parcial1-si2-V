package com.velora.pos.dto;

import java.math.BigDecimal;

import com.velora.pos.CashMovementType;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CashMovementRequest(

        @NotNull(message = "El tipo de movimiento es obligatorio.")
        CashMovementType movementType,

        @NotNull(message = "El monto es obligatorio.")
        @DecimalMin(
                value = "0.01",
                inclusive = true,
                message = "El monto debe ser mayor a cero."
        )
        BigDecimal amount,

        @NotBlank(message = "El motivo es obligatorio.")
        @Size(
                max = 500,
                message = "El motivo es demasiado largo."
        )
        String reason
) {}