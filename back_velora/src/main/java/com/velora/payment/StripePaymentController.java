package com.velora.payment;

import java.util.UUID;

import com.velora.payment.dto.StripeCheckoutResponse;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class StripePaymentController {

    private final StripePaymentService stripe;

    public StripePaymentController(
            StripePaymentService stripe
    ) {
        this.stripe = stripe;
    }

    @PostMapping(
            "/api/customer/orders/{orderId}/payments/stripe-checkout"
    )
    @ResponseStatus(HttpStatus.CREATED)
    public StripeCheckoutResponse createCheckout(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        return stripe.createCheckout(
                UUID.fromString(jwt.getSubject()),
                orderId
        );
    }

    @PostMapping(
            value = "/api/payments/stripe/webhook",
            consumes = "application/json"
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void webhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String signature
    ) {
        stripe.handleWebhook(
                payload,
                signature
        );
    }
}