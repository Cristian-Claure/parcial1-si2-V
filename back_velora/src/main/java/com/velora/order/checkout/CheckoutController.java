package com.velora.order.checkout;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/checkout")
public class CheckoutController {

    private final CheckoutService checkout;

    public CheckoutController(
            CheckoutService checkout
    ) {
        this.checkout = checkout;
    }

    @GetMapping("/warehouses")
    public List<CheckoutWarehouseResponse> warehouses(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return checkout.eligibleWarehouses(
                UUID.fromString(
                        jwt.getSubject()
                )
        );
    }
}