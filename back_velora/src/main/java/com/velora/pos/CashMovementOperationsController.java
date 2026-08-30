package com.velora.pos;

import java.util.List;
import java.util.UUID;

import com.velora.pos.dto.CashMovementRequest;
import com.velora.pos.dto.CashMovementResponse;

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
public class CashMovementOperationsController {

    private final CashMovementService service;

    public CashMovementOperationsController(
            CashMovementService service
    ) {
        this.service = service;
    }

    @PostMapping("/{sessionId}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public CashMovementResponse register(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @Valid @RequestBody CashMovementRequest request
    ) {
        return service.register(
                userId(jwt),
                sessionId,
                request
        );
    }

    @GetMapping("/{sessionId}/movements")
    public List<CashMovementResponse> list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId
    ) {
        return service.list(
                userId(jwt),
                sessionId
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