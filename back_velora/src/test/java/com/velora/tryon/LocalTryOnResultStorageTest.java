package com.velora.tryon;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class LocalTryOnResultStorageTest {

    @TempDir
    Path tempDir;

    @Test
    void storesAndLoadsValidPng() {
        LocalTryOnResultStorage storage =
                new LocalTryOnResultStorage(
                        tempDir.toString(),
                        1024
                );

        TryOnResultStorage.StoredResult stored =
                storage.store(png());

        assertEquals(
                "image/png",
                stored.contentType()
        );
        assertEquals(
                png().length,
                stored.sizeBytes()
        );
        assertTrue(
                stored.storageKey()
                        .endsWith(".png")
        );

        TryOnResultStorage.LoadedResult loaded =
                storage.load(
                        stored.storageKey()
                );

        assertEquals(
                "image/png",
                loaded.contentType()
        );
        assertEquals(
                png().length,
                loaded.sizeBytes()
        );
        assertTrue(
                loaded.resource().exists()
        );
    }

    @Test
    void recreatesRootBeforeStore()
            throws IOException {
        Path root =
                tempDir.resolve("results");

        LocalTryOnResultStorage storage =
                new LocalTryOnResultStorage(
                        root.toString(),
                        1024
                );

        Files.delete(root);

        storage.store(png());

        assertTrue(
                Files.isDirectory(root)
        );
    }

    @Test
    void rejectsInvalidImage() {
        LocalTryOnResultStorage storage =
                new LocalTryOnResultStorage(
                        tempDir.toString(),
                        1024
                );

        assertThrows(
                ResponseStatusException.class,
                () ->
                        storage.store(
                                "not-image".getBytes()
                        )
        );
    }

    @Test
    void rejectsOversizedImage() {
        LocalTryOnResultStorage storage =
                new LocalTryOnResultStorage(
                        tempDir.toString(),
                        4
                );

        assertThrows(
                ResponseStatusException.class,
                () -> storage.store(png())
        );
    }

    private byte[] png() {
        return new byte[] {
                (byte) 0x89,
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A
        };
    }
}
