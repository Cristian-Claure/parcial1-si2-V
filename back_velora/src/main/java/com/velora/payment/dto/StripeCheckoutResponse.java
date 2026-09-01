package com.velora.payment.dto;

import java.time.Instant;

public record StripeCheckoutResponse(
        PaymentResponse payment,
        String checkoutUrl,
        String sessionId,
        Instant expiresAt
) {}