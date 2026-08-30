package com.velora.pos;

import java.util.List;
import java.util.UUID;

import com.velora.pos.dto.CreatePointOfSaleRequest;
import com.velora.pos.dto.PointOfSaleResponse;
import com.velora.pos.dto.UpdatePointOfSaleRequest;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/points-of-sale")
public class AdminPointOfSaleController {

    private final PointOfSaleService service;

    public AdminPointOfSaleController(
            PointOfSaleService service
    ) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PointOfSaleResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreatePointOfSaleRequest request
    ) {
        return service.create(
                userId(jwt),
                request
        );
    }

    @GetMapping
    public List<PointOfSaleResponse> list(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return service.listAdmin(
                userId(jwt)
        );
    }

    @GetMapping("/{pointOfSaleId}")
    public PointOfSaleResponse get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID pointOfSaleId
    ) {
        return service.getAdmin(
                userId(jwt),
                pointOfSaleId
        );
    }

    @PutMapping("/{pointOfSaleId}")
    public PointOfSaleResponse update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID pointOfSaleId,
            @Valid @RequestBody UpdatePointOfSaleRequest request
    ) {
        return service.update(
                userId(jwt),
                pointOfSaleId,
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