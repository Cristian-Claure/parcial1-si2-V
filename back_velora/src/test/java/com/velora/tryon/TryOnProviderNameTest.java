package com.velora.tryon;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class TryOnProviderNameTest {

    @Test
    void parsesLocalAndReplicateOnly() {
        assertEquals(
                TryOnProviderName.LOCAL,
                TryOnProviderName.parse(
                        "local",
                        "replicate"
                )
        );

        assertEquals(
                TryOnProviderName.REPLICATE,
                TryOnProviderName.parse(
                        "REPLICATE",
                        "local"
                )
        );

        assertThrows(
                ResponseStatusException.class,
                () ->
                        TryOnProviderName.parse(
                                "fashn",
                                "replicate"
                        )
        );
    }

    @Test
    void usesConfiguredFallback() {
        assertEquals(
                TryOnProviderName.REPLICATE,
                TryOnProviderName.parse(
                        null,
                        "replicate"
                )
        );
    }
}
