package com.velora.catalog.asset;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(
        name = "velora.catalog.assets.provider",
        havingValue = "local",
        matchIfMissing = true
)
public class LocalCatalogAssetStorage implements CatalogAssetStorage {

    private final Path root;
    private final String publicBaseUrl;
    private final long maxBytes;

    public LocalCatalogAssetStorage(
            @Value("${velora.catalog.assets.local-directory:./storage/catalog}")
            String localDirectory,
            @Value("${velora.catalog.assets.public-base-url:http://localhost:8080}")
            String publicBaseUrl,
            @Value("${velora.catalog.assets.max-bytes:5242880}")
            long maxBytes
    ) {
        if (maxBytes <= 0) {
            throw new IllegalStateException(
                    "velora.catalog.assets.max-bytes debe ser mayor a cero."
            );
        }

        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            throw new IllegalStateException(
                    "velora.catalog.assets.public-base-url es obligatorio."
            );
        }

        this.root = Path.of(localDirectory)
                .toAbsolutePath()
                .normalize();
        this.publicBaseUrl = trimTrailingSlash(publicBaseUrl.trim());
        this.maxBytes = maxBytes;

        try {
            Files.createDirectories(root);
        } catch (IOException ex) {
            throw new IllegalStateException(
                    "No se pudo preparar el almacenamiento local del catálogo.",
                    ex
            );
        }
    }

    @Override
    public StoredAsset store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Seleccione una imagen para subir."
            );
        }

        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "La imagen supera el límite permitido de 5 MB."
            );
        }

        byte[] bytes;

        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No se pudo leer la imagen enviada.",
                    ex
            );
        }

        DetectedImage detected = detectImage(bytes);
        validateReportedContentType(
                file.getContentType(),
                detected.contentType()
        );

        String storageKey =
                UUID.randomUUID()
                        + "."
                        + detected.extension();

        Path target = resolveStorageKey(storageKey);

        try {
            Files.write(
                    target,
                    bytes,
                    StandardOpenOption.CREATE_NEW,
                    StandardOpenOption.WRITE
            );
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo guardar la imagen del catálogo.",
                    ex
            );
        }

        return new StoredAsset(
                storageKey,
                publicBaseUrl
                        + "/api/catalog/assets/"
                        + storageKey,
                detected.contentType(),
                bytes.length
        );
    }

    @Override
    public LoadedAsset load(String storageKey) {
        Path target = resolveStorageKey(storageKey);

        if (!Files.isRegularFile(target)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Imagen de catálogo no encontrada."
            );
        }

        try {
            Resource resource = new UrlResource(target.toUri());

            if (!resource.exists() || !resource.isReadable()) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Imagen de catálogo no encontrada."
                );
            }

            return new LoadedAsset(
                    resource,
                    contentTypeFromKey(storageKey)
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo leer la imagen del catálogo.",
                    ex
            );
        }
    }

    @Override
    public void delete(String storageKey) {
        Path target = resolveStorageKey(storageKey);

        try {
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
            // Cleanup best effort: never replace the original business error.
        }
    }

    private Path resolveStorageKey(String storageKey) {
        if (storageKey == null
                || !storageKey.matches(
                        "^[0-9a-fA-F-]{36}\\.(jpg|png|webp)$"
                )) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Imagen de catálogo no encontrada."
            );
        }

        Path target = root.resolve(storageKey).normalize();

        if (!target.startsWith(root)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Imagen de catálogo no encontrada."
            );
        }

        return target;
    }

    private DetectedImage detectImage(byte[] bytes) {
        if (isPng(bytes)) {
            return new DetectedImage("image/png", "png");
        }

        if (isJpeg(bytes)) {
            return new DetectedImage("image/jpeg", "jpg");
        }

        if (isWebp(bytes)) {
            return new DetectedImage("image/webp", "webp");
        }

        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Solo se permiten imágenes PNG, JPG/JPEG o WEBP válidas."
        );
    }

    private void validateReportedContentType(
            String reported,
            String detected
    ) {
        if (reported == null || reported.isBlank()) {
            return;
        }

        String normalized =
                reported.trim().toLowerCase(Locale.ROOT);

        if (!normalized.equals(detected)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El tipo declarado del archivo no coincide con su contenido."
            );
        }
    }

    private boolean isPng(byte[] bytes) {
        return bytes.length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A;
    }

    private boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
    }

    private boolean isWebp(byte[] bytes) {
        return bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P';
    }

    private String contentTypeFromKey(String storageKey) {
        if (storageKey.endsWith(".png")) {
            return "image/png";
        }

        if (storageKey.endsWith(".webp")) {
            return "image/webp";
        }

        return "image/jpeg";
    }

    private String trimTrailingSlash(String value) {
        String result = value;

        while (result.endsWith("/")) {
            result = result.substring(
                    0,
                    result.length() - 1
            );
        }

        return result;
    }

    private record DetectedImage(
            String contentType,
            String extension
    ) {}
}
