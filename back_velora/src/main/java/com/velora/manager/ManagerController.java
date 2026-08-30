package com.velora.manager;

import java.util.UUID;
import com.velora.auth.AuthService;
import com.velora.auth.dto.UserProfileResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/manager")
public class ManagerController {
    private final AuthService auth;

    public ManagerController(AuthService auth) {
        this.auth = auth;
    }

    @GetMapping("/context")
    public UserProfileResponse context(@AuthenticationPrincipal Jwt jwt) {
        return auth.profile(UUID.fromString(jwt.getSubject()));
    }
}
