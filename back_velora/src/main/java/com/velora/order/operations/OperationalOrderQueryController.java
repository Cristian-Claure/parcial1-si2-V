package com.velora.order.operations;

import java.util.List;
import java.util.UUID;

import com.velora.order.operations.dto.OperationalOrderResponse;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({
        "/api/admin/orders",
        "/api/manager/orders"
})
public class OperationalOrderQueryController {

    private final OperationalOrderQueryService query;

    public OperationalOrderQueryController(
            OperationalOrderQueryService query
    ) {
        this.query = query;
    }

    @GetMapping
    public List<OperationalOrderResponse> list(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return query.list(
                UUID.fromString(
                        jwt.getSubject()
                )
        );
    }
}