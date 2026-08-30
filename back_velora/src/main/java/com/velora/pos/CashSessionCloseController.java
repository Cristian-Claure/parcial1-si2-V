package com.velora.pos;

import java.util.UUID;

import com.velora.pos.dto.CashSessionResponse;
import com.velora.pos.dto.CloseCashSessionRequest;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/cash-sessions",
        "/api/manager/cash-sessions"
})
public class CashSessionCloseController {

    private final CashSessionCloseService service;

    public CashSessionCloseController(
            CashSessionCloseService service
    ) {
        this.service = service;
    }

    @PostMapping("/{sessionId}/close")
    public CashSessionResponse close(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID sessionId,
            @Valid @RequestBody CloseCashSessionRequest request
    ) {
        return service.close(
                userId(jwt),
                sessionId,
                request
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