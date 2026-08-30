package com.velora.payment;

import java.util.UUID;

import com.velora.payment.dto.ConfirmPaymentRequest;
import com.velora.payment.dto.PaymentActionRequest;
import com.velora.payment.dto.PaymentResponse;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/payments",
        "/api/manager/payments"
})
public class PaymentOperationsController {

    private final PaymentService payments;

    public PaymentOperationsController(
            PaymentService payments
    ) {
        this.payments = payments;
    }

    @PostMapping("/{paymentId}/confirm")
    public PaymentResponse confirm(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody ConfirmPaymentRequest request
    ) {
        return payments.confirmPaid(
                userId(jwt),
                paymentId,
                request
        );
    }

    @PostMapping("/{paymentId}/fail")
    public PaymentResponse fail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody PaymentActionRequest request
    ) {
        return payments.markFailed(
                userId(jwt),
                paymentId,
                request
        );
    }

    @PostMapping("/{paymentId}/refund")
    public PaymentResponse refund(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody PaymentActionRequest request
    ) {
        return payments.refund(
                userId(jwt),
                paymentId,
                request
        );
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(
                jwt.getSubject()
        );
    }
}