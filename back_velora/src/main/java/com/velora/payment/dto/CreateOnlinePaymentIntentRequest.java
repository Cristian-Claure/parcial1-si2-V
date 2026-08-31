package com.velora.payment.dto;

import com.velora.payment.PaymentMethod;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateOnlinePaymentIntentRequest(

        @NotNull(
                message = "El método de pago es obligatorio."
        )
        PaymentMethod method,

        /*
         * Token temporal generado por la capa
         * de tokenización del frontend/gateway.
         *
         * Nunca debe contener el número completo
         * de tarjeta ni el CVV.
         */
        @Size(
                max = 120,
                message = "El token de tarjeta es demasiado largo."
        )
        String cardToken,

        @Size(
                max = 30,
                message = "La marca de tarjeta es demasiado larga."
        )
        String cardBrand,

        @Pattern(
                regexp = "\\d{4}",
                message = "Los últimos cuatro dígitos no son válidos."
        )
        String cardLast4,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String notes
) {}