package com.velora.pos;

import java.util.UUID;

import com.velora.pos.dto.CashSessionResponse;
import com.velora.pos.dto.OpenCashSessionRequest;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/cash-sessions",
        "/api/manager/cash-sessions"
})
public class CashSessionOperationsController {

    private final CashSessionService service;

    public CashSessionOperationsController(
            CashSessionService service
    ) {
        this.service = service;
    }

    @PostMapping("/open")
    @ResponseStatus(HttpStatus.CREATED)
    public CashSessionResponse open(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody OpenCashSessionRequest request
    ) {
        return service.open(
                userId(jwt),
                request
        );
    }

    @GetMapping("/open/{pointOfSaleId}")
    public CashSessionResponse getOpen(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID pointOfSaleId
    ) {
        return service.getOpen(
                userId(jwt),
                pointOfSaleId
        );
    }

    private UUID userId(
            Jwt jwt
    ) {
        return UUID.fromString(
                jwt.getSubject()
        );
    }
}