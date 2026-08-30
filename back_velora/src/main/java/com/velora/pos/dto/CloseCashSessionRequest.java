package com.velora.pos.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CloseCashSessionRequest(

        @NotNull(message = "El efectivo contado es obligatorio.")
        @DecimalMin(
                value = "0.00",
                inclusive = true,
                message = "El efectivo contado no puede ser negativo."
        )
        BigDecimal countedCashAmount,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String closingNotes
) {}