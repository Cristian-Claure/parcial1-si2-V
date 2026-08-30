package com.velora.payment.dto;

import jakarta.validation.constraints.Size;

public record PaymentActionRequest(

        @Size(
                max = 500,
                message = "El motivo es demasiado largo."
        )
        String reason
) {}