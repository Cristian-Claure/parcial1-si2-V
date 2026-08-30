package com.velora.pos;

import java.util.UUID;

import com.velora.payment.dto.PaymentActionRequest;
import com.velora.pos.dto.PosPaymentResolutionResponse;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/pos/sales/payments",
        "/api/manager/pos/sales/payments"
})
public class PosPaymentResolutionController {

    private final PosPaymentResolutionService service;

    public PosPaymentResolutionController(
            PosPaymentResolutionService service
    ) {
        this.service = service;
    }

    @PostMapping("/{paymentId}/fail")
    public PosPaymentResolutionResponse fail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody PaymentActionRequest request
    ) {
        return service.fail(
                UUID.fromString(jwt.getSubject()),
                paymentId,
                request
        );
    }

    @PostMapping("/{paymentId}/cancel")
    public PosPaymentResolutionResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody PaymentActionRequest request
    ) {
        return service.cancel(
                UUID.fromString(jwt.getSubject()),
                paymentId,
                request
        );
    }
}