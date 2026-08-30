package com.velora.pos.dto;

import java.math.BigDecimal;
import java.util.UUID;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record OpenCashSessionRequest(

        @NotNull(message = "El punto de venta es obligatorio.")
        UUID pointOfSaleId,

        @NotNull(message = "El monto inicial es obligatorio.")
        @DecimalMin(
                value = "0.00",
                inclusive = true,
                message = "El monto inicial no puede ser negativo."
        )
        BigDecimal openingAmount,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String openingNotes
) {}