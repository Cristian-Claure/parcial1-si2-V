package com.velora.order;

import java.util.UUID;

import com.velora.order.dto.OrderResponse;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({
        "/api/admin/orders",
        "/api/manager/orders"
})
public class OrderOperationsController {

    private final OrderService orders;

    public OrderOperationsController(
            OrderService orders
    ) {
        this.orders = orders;
    }

    @PostMapping("/{orderId}/fulfill")
    public OrderResponse fulfill(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID orderId
    ) {
        return orders.fulfill(
                UUID.fromString(jwt.getSubject()),
                orderId
        );
    }
}