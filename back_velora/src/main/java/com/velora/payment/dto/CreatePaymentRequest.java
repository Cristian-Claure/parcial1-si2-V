package com.velora.payment.dto;

import com.velora.payment.PaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreatePaymentRequest(

        @NotNull(message = "El método de pago es obligatorio.")
        PaymentMethod method,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String notes
) {}