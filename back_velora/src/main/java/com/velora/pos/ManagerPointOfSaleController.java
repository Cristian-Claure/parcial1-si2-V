package com.velora.pos;

import java.util.List;
import java.util.UUID;

import com.velora.pos.dto.PointOfSaleResponse;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/manager/points-of-sale")
public class ManagerPointOfSaleController {

    private final PointOfSaleService service;

    public ManagerPointOfSaleController(
            PointOfSaleService service
    ) {
        this.service = service;
    }

    @GetMapping
    public List<PointOfSaleResponse> list(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return service.listManager(
                userId(jwt)
        );
    }

    @GetMapping("/{pointOfSaleId}")
    public PointOfSaleResponse get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID pointOfSaleId
    ) {
        return service.getManager(
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