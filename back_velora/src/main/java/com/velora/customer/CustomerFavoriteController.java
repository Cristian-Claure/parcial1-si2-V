package com.velora.customer;

import java.util.List;
import java.util.UUID;

import com.velora.customer.dto.CustomerFavoriteResponse;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customer/favorites")
public class CustomerFavoriteController {

    private final CustomerFavoriteService favorites;

    public CustomerFavoriteController(
            CustomerFavoriteService favorites
    ) {
        this.favorites = favorites;
    }

    @GetMapping
    public List<CustomerFavoriteResponse> list(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return favorites.list(
                customerId(jwt)
        );
    }

    @PostMapping("/{productId}")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerFavoriteResponse add(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID productId
    ) {
        return favorites.add(
                customerId(jwt),
                productId
        );
    }

    @DeleteMapping("/{productId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID productId
    ) {
        favorites.remove(
                customerId(jwt),
                productId
        );
    }

    private UUID customerId(
            Jwt jwt
    ) {
        return UUID.fromString(
                jwt.getSubject()
        );
    }
}