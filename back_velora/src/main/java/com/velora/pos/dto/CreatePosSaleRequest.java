package com.velora.pos.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.payment.PaymentMethod;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreatePosSaleRequest(

        @NotNull(message = "El identificador de operación es obligatorio.")
        UUID clientOperationId,

        Instant clientCreatedAt,

        @NotNull(message = "La sesión de caja es obligatoria.")
        UUID cashSessionId,

        UUID customerId,

        @NotNull(message = "El método de pago es obligatorio.")
        PaymentMethod paymentMethod,

        @NotEmpty(message = "La venta debe contener productos.")
        @Size(
                max = 100,
                message = "La venta contiene demasiadas líneas."
        )
        List<@Valid PosSaleItemRequest> items,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String notes
) {}