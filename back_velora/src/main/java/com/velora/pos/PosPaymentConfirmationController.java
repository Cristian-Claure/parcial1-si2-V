package com.velora.pos;

import java.util.UUID;

import com.velora.pos.dto.ConfirmPosPaymentRequest;
import com.velora.pos.dto.PosPaymentConfirmationResponse;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/pos/sales/payments",
        "/api/manager/pos/sales/payments"
})
public class PosPaymentConfirmationController {

    private final PosPaymentConfirmationService service;

    public PosPaymentConfirmationController(
            PosPaymentConfirmationService service
    ) {
        this.service = service;
    }

    @PostMapping("/{paymentId}/confirm")
    public PosPaymentConfirmationResponse confirm(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID paymentId,
            @Valid @RequestBody ConfirmPosPaymentRequest request
    ) {
        return service.confirm(
                UUID.fromString(
                        jwt.getSubject()
                ),
                paymentId,
                request
        );
    }
}