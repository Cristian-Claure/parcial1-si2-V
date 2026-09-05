package com.velora.catalog.asset;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

class LocalCatalogAssetStorageTest {

    @TempDir
    Path tempDir;

    @Test
    void storesAndLoadsValidPng() {
        LocalCatalogAssetStorage storage =
                new LocalCatalogAssetStorage(
                        tempDir.toString(),
                        "http://localhost:8080/",
                        1024
                );

        MultipartFile file = pngFile();

        CatalogAssetStorage.StoredAsset stored =
                storage.store(file);

        assertEquals("image/png", stored.contentType());
        assertEquals(8, stored.sizeBytes());
        assertTrue(stored.storageKey().endsWith(".png"));
        assertEquals(
                "http://localhost:8080/api/catalog/assets/"
                        + stored.storageKey(),
                stored.publicUrl()
        );
        assertTrue(
                Files.isRegularFile(
                        tempDir.resolve(stored.storageKey())
                )
        );

        CatalogAssetStorage.LoadedAsset loaded =
                storage.load(stored.storageKey());

        assertEquals("image/png", loaded.contentType());
        assertTrue(loaded.resource().exists());
    }

    @Test
    void recreatesLocalRootBeforeStoreWhenDirectoryWasRemoved()
            throws IOException {
        Path catalogRoot = tempDir.resolve("catalog");

        LocalCatalogAssetStorage storage =
                new LocalCatalogAssetStorage(
                        catalogRoot.toString(),
                        "http://localhost:8080",
                        1024
                );

        Files.delete(catalogRoot);

        assertFalse(Files.exists(catalogRoot));

        CatalogAssetStorage.StoredAsset stored =
                storage.store(pngFile());

        assertTrue(
                Files.isRegularFile(
                        catalogRoot.resolve(stored.storageKey())
                )
        );
    }

    @Test
    void rejectsFileWhoseContentIsNotAnAllowedImage() {
        LocalCatalogAssetStorage storage =
                new LocalCatalogAssetStorage(
                        tempDir.toString(),
                        "http://localhost:8080",
                        1024
                );

        MultipartFile file = new TestMultipartFile(
                "fake.png",
                "image/png",
                "not-a-real-image".getBytes()
        );

        assertThrows(
                ResponseStatusException.class,
                () -> storage.store(file)
        );
    }

    @Test
    void rejectsFileOverConfiguredLimit() {
        LocalCatalogAssetStorage storage =
                new LocalCatalogAssetStorage(
                        tempDir.toString(),
                        "http://localhost:8080",
                        4
                );

        assertThrows(
                ResponseStatusException.class,
                () -> storage.store(pngFile())
        );
    }

    private MultipartFile pngFile() {
        return new TestMultipartFile(
                "garment.png",
                "image/png",
                new byte[] {
                        (byte) 0x89,
                        0x50,
                        0x4E,
                        0x47,
                        0x0D,
                        0x0A,
                        0x1A,
                        0x0A
                }
        );
    }

    private static final class TestMultipartFile
            implements MultipartFile {

        private final String originalFilename;
        private final String contentType;
        private final byte[] bytes;

        private TestMultipartFile(
                String originalFilename,
                String contentType,
                byte[] bytes
        ) {
            this.originalFilename = originalFilename;
            this.contentType = contentType;
            this.bytes = bytes.clone();
        }

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return originalFilename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        @Override
        public boolean isEmpty() {
            return bytes.length == 0;
        }

        @Override
        public long getSize() {
            return bytes.length;
        }

        @Override
        public byte[] getBytes() {
            return bytes.clone();
        }

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public void transferTo(File dest) throws IOException {
            Files.write(dest.toPath(), bytes);
        }
    }
}
