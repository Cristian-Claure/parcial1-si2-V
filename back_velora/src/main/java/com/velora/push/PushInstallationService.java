package com.velora.push;

import java.time.Instant;
import java.util.UUID;

import com.velora.push.dto.PushInstallationResponse;
import com.velora.push.dto.RegisterPushInstallationRequest;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PushInstallationService {

    private final PushInstallationRepository installations;
    private final UserRepository users;

    public PushInstallationService(
            PushInstallationRepository installations,
            UserRepository users
    ) {
        this.installations = installations;
        this.users = users;
    }

    @Transactional
    public PushInstallationResponse register(
            UUID userId,
            RegisterPushInstallationRequest request
    ) {
        UserEntity user =
                requireActiveUser(userId);

        String installationId =
                normalizeInstallationId(
                        request.installationId()
                );

        Instant now = Instant.now();

        PushInstallationEntity installation =
                installations
                        .findByPlatformAndInstallationId(
                                request.platform(),
                                installationId
                        )
                        .orElseGet(
                                PushInstallationEntity::new
                        );

        /*
         * Si la instalación ya existía para una sesión anterior,
         * la reasociamos al usuario autenticado actual.
         * Esto evita que una reinstalación/login reutilizado quede
         * vinculado a la cuenta anterior.
         */
        installation.setUser(user);
        installation.setInstallationId(
                installationId
        );
        installation.setPlatform(
                request.platform()
        );
        installation.setDeviceLabel(
                normalizeDeviceLabel(
                        request.deviceLabel()
                )
        );
        installation.setActive(true);
        installation.setRevokedAt(null);
        installation.setLastSeenAt(now);

        return PushInstallationResponse.from(
                installations.save(installation)
        );
    }

    @Transactional
    public void revoke(
            UUID userId,
            PushPlatform platform,
            String rawInstallationId
    ) {
        requireUser(userId);

        String installationId =
                normalizeInstallationId(
                        rawInstallationId
                );

        installations
                .findByUserIdAndPlatformAndInstallationId(
                        userId,
                        platform,
                        installationId
                )
                .ifPresent(
                        installation -> {
                            Instant now =
                                    Instant.now();

                            installation.setActive(
                                    false
                            );
                            installation.setRevokedAt(
                                    now
                            );
                            installation.setLastSeenAt(
                                    now
                            );
                        }
                );
    }

    private UserEntity requireActiveUser(
            UUID userId
    ) {
        UserEntity user =
                requireUser(userId);

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La cuenta no está activa."
            );
        }

        return user;
    }

    private UserEntity requireUser(
            UUID userId
    ) {
        return users
                .findById(userId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.UNAUTHORIZED,
                                        "Usuario autenticado no encontrado."
                                )
                );
    }

    private String normalizeInstallationId(
            String value
    ) {
        if (value == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El identificador de instalación es obligatorio."
            );
        }

        String normalized =
                value.trim();

        if (
                normalized.isEmpty() ||
                normalized.length() > 255
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El identificador de instalación no es válido."
            );
        }

        return normalized;
    }

    private String normalizeDeviceLabel(
            String value
    ) {
        if (value == null) {
            return null;
        }

        String normalized =
                value.trim();

        return normalized.isEmpty()
                ? null
                : normalized;
    }
}
