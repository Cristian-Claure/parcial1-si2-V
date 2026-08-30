package com.velora.pos.dto;

import jakarta.validation.constraints.Size;

public record ConfirmPosPaymentRequest(

        @Size(
                max = 500,
                message = "El motivo es demasiado largo."
        )
        String reason
) {}