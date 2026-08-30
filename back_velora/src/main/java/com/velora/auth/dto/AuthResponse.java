package com.velora.auth.dto;

public record AuthResponse(
        String accessToken,
        long expiresInSeconds,
        UserProfileResponse user
) {}
