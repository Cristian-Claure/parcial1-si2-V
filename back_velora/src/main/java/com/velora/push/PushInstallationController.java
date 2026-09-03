package com.velora.push;

import java.util.UUID;

import com.velora.push.dto.PushInstallationResponse;
import com.velora.push.dto.RegisterPushInstallationRequest;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/push/installations")
public class PushInstallationController {

    private final PushInstallationService service;

    public PushInstallationController(
            PushInstallationService service
    ) {
        this.service = service;
    }

    @PutMapping
    public PushInstallationResponse register(
            @AuthenticationPrincipal Jwt jwt,
            @Valid
            @RequestBody
            RegisterPushInstallationRequest request
    ) {
        return service.register(
                userId(jwt),
                request
        );
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam PushPlatform platform,
            @RequestParam String installationId
    ) {
        service.revoke(
                userId(jwt),
                platform,
                installationId
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
