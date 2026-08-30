package com.velora.order;

import java.util.List;
import java.util.UUID;

import com.velora.order.dto.CreateOrderRequest;
import com.velora.order.dto.OrderResponse;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customer/orders")
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateOrderRequest request
    ) {
        return orders.create(
                userId(jwt),
                request
        );
    }

    @GetMapping
    public List<OrderResponse> list(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return orders.list(
                userId(jwt)
        );
    }

    @GetMapping("/{orderId}")
    public OrderResponse get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        return orders.get(
                userId(jwt),
                orderId
        );
    }

    @PostMapping("/{orderId}/cancel")
    public OrderResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        return orders.cancel(
                userId(jwt),
                orderId
        );
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(
                jwt.getSubject()
        );
    }
}