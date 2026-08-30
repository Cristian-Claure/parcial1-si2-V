package com.velora.security;

import java.time.Duration;
import java.time.Instant;

import com.velora.auth.dto.AuthResponse;
import com.velora.auth.dto.UserProfileResponse;
import com.velora.user.UserEntity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private final JwtEncoder encoder;
    private final Duration duration;

    public JwtService(
            JwtEncoder encoder,
            @Value("${velora.security.jwt-expiration-minutes:120}") long expirationMinutes
    ) {
        this.encoder = encoder;
        this.duration = Duration.ofMinutes(expirationMinutes);
    }

    public AuthResponse issue(UserEntity user) {
        Instant now = Instant.now();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("velora")
                .issuedAt(now)
                .expiresAt(now.plus(duration))
                .subject(user.getId().toString())
                .claim("email", user.getEmail())
                .claim("role", user.getRole().name())
                .claim("name", user.getFirstName() + " " + user.getLastName())
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        return new AuthResponse(token, duration.toSeconds(), UserProfileResponse.from(user));
    }
}
