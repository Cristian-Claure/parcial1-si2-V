package com.velora.catalog.asset;

import java.io.IOException;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;

@Component
@ConditionalOnProperty(
        name = "velora.catalog.assets.provider",
        havingValue = "gcs"
)
public class GcsCatalogAssetStorage implements CatalogAssetStorage {

    private final Storage storage;
    private final String bucket;
    private final String prefix;
    private final String publicBaseUrl;
    private final long maxBytes;

    public GcsCatalogAssetStorage(
            @Value("${velora.catalog.assets.gcs.bucket:}")
            String bucket,
            @Value("${velora.catalog.assets.gcs.prefix:catalog}")
            String prefix,
            @Value("${velora.catalog.assets.public-base-url:}")
            String publicBaseUrl,
            @Value("${velora.catalog.assets.max-bytes:5242880}")
            long maxBytes
    ) {
        this.bucket = requireText(
                bucket,
                "velora.catalog.assets.gcs.bucket"
        );
        this.prefix = normalizePrefix(prefix, "catalog");
        this.publicBaseUrl = trimTrailingSlash(
                requireText(
                        publicBaseUrl,
                        "velora.catalog.assets.public-base-url"
                )
        );

        if (maxBytes <= 0) {
            throw new IllegalStateException(
                    "velora.catalog.assets.max-bytes debe ser mayor a cero."
            );
        }

        this.maxBytes = maxBytes;
        this.storage =
                StorageOptions.getDefaultInstance()
                        .getService();
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
                    "La imagen supera el lÃ­mite permitido de 5 MB."
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

        BlobInfo blob =
                BlobInfo.newBuilder(
                        BlobId.of(
                                bucket,
                                objectName(storageKey)
                        )
                )
                .setContentType(detected.contentType())
                .setCacheControl(
                        "private, max-age=3600"
                )
                .build();

        try {
            storage.create(
                    blob,
                    bytes,
                    Storage.BlobTargetOption
                            .doesNotExist()
            );
        } catch (StorageException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo guardar la imagen "
                    + "del catÃ¡logo en Google Cloud Storage.",
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
        String normalized = requireStorageKey(storageKey);

        try {
            Blob blob =
                    storage.get(
                            BlobId.of(
                                    bucket,
                                    objectName(normalized)
                            )
                    );

            if (blob == null || !blob.exists()) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Imagen de catÃ¡logo no encontrada."
                );
            }

            byte[] bytes = blob.getContent();

            if (bytes.length == 0 || bytes.length > maxBytes) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "La imagen almacenada no cumple "
                        + "los lÃ­mites de VÃ‰LORA."
                );
            }

            DetectedImage detected = detectImage(bytes);

            return new LoadedAsset(
                    new ByteArrayResource(bytes),
                    detected.contentType()
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (StorageException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo leer la imagen "
                    + "desde Google Cloud Storage.",
                    ex
            );
        }
    }

    @Override
    public void delete(String storageKey) {
        String normalized;

        try {
            normalized = requireStorageKey(storageKey);
        } catch (ResponseStatusException ex) {
            return;
        }

        try {
            storage.delete(
                    BlobId.of(
                            bucket,
                            objectName(normalized)
                    )
            );
        } catch (StorageException ignored) {
            // Cleanup best effort.
        }
    }

    private String objectName(String storageKey) {
        return prefix + "/" + storageKey;
    }

    private String requireStorageKey(String storageKey) {
        if (
                storageKey == null
                || !storageKey.matches(
                        "^[0-9a-fA-F-]{36}\\.(jpg|png|webp)$"
                )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Imagen de catÃ¡logo no encontrada."
            );
        }

        return storageKey;
    }

    private DetectedImage detectImage(byte[] bytes) {
        if (
                bytes.length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A
        ) {
            return new DetectedImage(
                    "image/png",
                    "png"
            );
        }

        if (
                bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF
        ) {
            return new DetectedImage(
                    "image/jpeg",
                    "jpg"
            );
        }

        if (
                bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P'
        ) {
            return new DetectedImage(
                    "image/webp",
                    "webp"
            );
        }

        throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Solo se permiten imÃ¡genes PNG, "
                + "JPG/JPEG o WEBP vÃ¡lidas."
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
                reported.trim()
                        .toLowerCase(Locale.ROOT);

        if ("image/jpg".equals(normalized)) {
            normalized = "image/jpeg";
        }

        if (!normalized.equals(detected)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El tipo declarado del archivo "
                    + "no coincide con su contenido."
            );
        }
    }

    private String normalizePrefix(
            String value,
            String fallback
    ) {
        String normalized =
                value == null || value.isBlank()
                        ? fallback
                        : value.trim();

        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }

        while (normalized.endsWith("/")) {
            normalized = normalized.substring(
                    0,
                    normalized.length() - 1
            );
        }

        if (
                normalized.isBlank()
                || normalized.contains("..")
                || normalized.contains("\\")
        ) {
            throw new IllegalStateException(
                    "Prefijo GCS de catÃ¡logo invÃ¡lido."
            );
        }

        return normalized;
    }

    private String requireText(
            String value,
            String property
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    property + " es obligatorio "
                    + "cuando el proveedor es GCS."
            );
        }

        return value.trim();
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