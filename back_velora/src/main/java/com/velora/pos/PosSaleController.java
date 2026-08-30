package com.velora.pos;

import java.util.UUID;

import com.velora.pos.dto.CreatePosSaleRequest;
import com.velora.pos.dto.PosSaleResponse;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/pos/sales",
        "/api/manager/pos/sales"
})
public class PosSaleController {

    private final PosSaleService service;

    public PosSaleController(
            PosSaleService service
    ) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PosSaleResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePosSaleRequest request
    ) {
        return service.create(
                UUID.fromString(
                        jwt.getSubject()
                ),
                request
        );
    }
}