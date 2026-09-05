package com.velora.tryon;

import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public enum TryOnProviderName {
    LOCAL,
    REPLICATE;

    public static TryOnProviderName parse(
            String value,
            String fallback
    ) {
        String selected =
                value == null || value.isBlank()
                        ? fallback
                        : value;

        if (selected == null || selected.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "El proveedor del probador virtual no está configurado."
            );
        }

        try {
            return valueOf(
                    selected.trim()
                            .toUpperCase(Locale.ROOT)
            );
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El proveedor del probador virtual debe ser LOCAL o REPLICATE.",
                    ex
            );
        }
    }

    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }
}
