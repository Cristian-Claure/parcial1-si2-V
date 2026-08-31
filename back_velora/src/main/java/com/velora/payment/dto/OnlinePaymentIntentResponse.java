package com.velora.payment.dto;

import java.time.Instant;

public record OnlinePaymentIntentResponse(

        PaymentResponse payment,

        /*
         * Solo aplica a QR.
         * El frontend convierte este payload
         * en una imagen QR escaneable.
         */
        String qrPayload,

        /*
         * Solo aplica a QR.
         */
        Instant expiresAt
) {}