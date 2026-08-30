package com.velora.payment;

import java.util.List;
import java.util.UUID;

import com.velora.payment.dto.CreatePaymentRequest;
import com.velora.payment.dto.PaymentActionRequest;
import com.velora.payment.dto.PaymentHistoryResponse;
import com.velora.payment.dto.PaymentResponse;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customer")
public class CustomerPaymentController {

    private final PaymentService payments;

    public CustomerPaymentController(
            PaymentService payments
    ) {
        this.payments = payments;
    }

    @PostMapping("/orders/{orderId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId,
            @Valid @RequestBody CreatePaymentRequest request
    ) {
        return payments.create(
                userId(jwt),
                orderId,
                request
        );
    }

    @GetMapping("/orders/{orderId}/payments")
    public List<PaymentResponse> list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        return payments.listForCustomerOrder(
                userId(jwt),
                orderId
        );
    }

    @GetMapping("/payments/{paymentId}")
    public PaymentResponse get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId
    ) {
        return payments.getForCustomer(
                userId(jwt),
                paymentId
        );
    }

    @GetMapping("/payments/{paymentId}/history")
    public List<PaymentHistoryResponse> history(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId
    ) {
        return payments.historyForCustomer(
                userId(jwt),
                paymentId
        );
    }

    @PostMapping("/payments/{paymentId}/cancel")
    public PaymentResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody PaymentActionRequest request
    ) {
        return payments.cancelPending(
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