package com.velora.tryon;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;

@Component
@ConditionalOnProperty(
        name = "velora.tryon.results.provider",
        havingValue = "gcs"
)
public class GcsTryOnResultStorage
        implements TryOnResultStorage {

    private final Storage storage;
    private final String bucket;
    private final String prefix;
    private final long maxBytes;

    public GcsTryOnResultStorage(
            @Value("${velora.tryon.results.gcs.bucket:}")
            String bucket,
            @Value("${velora.tryon.results.gcs.prefix:tryon-results}")
            String prefix,
            @Value("${velora.tryon.results.max-bytes:12582912}")
            long maxBytes
    ) {
        this.bucket = requireText(
                bucket,
                "velora.tryon.results.gcs.bucket"
        );
        this.prefix = normalizePrefix(
                prefix,
                "tryon-results"
        );

        if (maxBytes <= 0) {
            throw new IllegalStateException(
                    "velora.tryon.results.max-bytes "
                    + "debe ser mayor a cero."
            );
        }

        this.maxBytes = maxBytes;
        this.storage =
                StorageOptions.getDefaultInstance()
                        .getService();
    }

    @Override
    public StoredResult store(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El probador virtual devolviÃ³ "
                    + "un resultado vacÃ­o."
            );
        }

        if (bytes.length > maxBytes) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El resultado del probador virtual "
                    + "supera el lÃ­mite permitido."
            );
        }

        DetectedImage detected = detect(bytes);

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
                .setCacheControl("private, no-store")
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
                    "No se pudo guardar el resultado "
                    + "del probador virtual en "
                    + "Google Cloud Storage.",
                    ex
            );
        }

        return new StoredResult(
                storageKey,
                detected.contentType(),
                bytes.length
        );
    }

    @Override
    public LoadedResult load(String storageKey) {
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
                        "Resultado del probador virtual "
                        + "no encontrado."
                );
            }

            byte[] bytes = blob.getContent();

            if (bytes.length == 0 || bytes.length > maxBytes) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "El resultado almacenado no cumple "
                        + "los lÃ­mites de VÃ‰LORA."
                );
            }

            DetectedImage detected = detect(bytes);

            return new LoadedResult(
                    new ByteArrayResource(bytes),
                    detected.contentType(),
                    bytes.length
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (StorageException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo leer el resultado "
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
                    "Resultado del probador virtual "
                    + "no encontrado."
            );
        }

        return storageKey;
    }

    private DetectedImage detect(byte[] bytes) {
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
                HttpStatus.BAD_GATEWAY,
                "El proveedor devolviÃ³ un resultado "
                + "que no es PNG, JPG/JPEG "
                + "o WEBP vÃ¡lido."
        );
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
                    "Prefijo GCS de resultados invÃ¡lido."
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

    private record DetectedImage(
            String contentType,
            String extension
    ) {}
}