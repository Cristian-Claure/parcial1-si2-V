package com.velora.tryon;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(
        name = "velora.tryon.results.provider",
        havingValue = "local",
        matchIfMissing = true
)
public class LocalTryOnResultStorage
        implements TryOnResultStorage {

    private final Path root;
    private final long maxBytes;

    public LocalTryOnResultStorage(
            @Value(
                "${velora.tryon.results.local-directory:"
                + "./storage/try-on-results}"
            )
            String localDirectory,
            @Value(
                "${velora.tryon.results.max-bytes:12582912}"
            )
            long maxBytes
    ) {
        if (maxBytes <= 0) {
            throw new IllegalStateException(
                    "velora.tryon.results.max-bytes debe ser mayor a cero."
            );
        }

        this.root = Path.of(localDirectory)
                .toAbsolutePath()
                .normalize();
        this.maxBytes = maxBytes;

        try {
            Files.createDirectories(root);
        } catch (IOException ex) {
            throw new IllegalStateException(
                    "No se pudo preparar el almacenamiento local "
                    + "de resultados del probador virtual.",
                    ex
            );
        }
    }

    @Override
    public StoredResult store(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El probador virtual devolvió un resultado vacío."
            );
        }

        if (bytes.length > maxBytes) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El resultado del probador virtual supera "
                    + "el límite permitido."
            );
        }

        DetectedImage detected = detect(bytes);

        String storageKey =
                UUID.randomUUID()
                        + "."
                        + detected.extension();

        Path target = resolve(storageKey);

        try {
            Files.createDirectories(root);
            Files.write(
                    target,
                    bytes,
                    StandardOpenOption.CREATE_NEW,
                    StandardOpenOption.WRITE
            );
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo guardar el resultado "
                    + "del probador virtual.",
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
        Path target = resolve(storageKey);

        if (!Files.isRegularFile(target)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Resultado del probador virtual no encontrado."
            );
        }

        try {
            Resource resource =
                    new UrlResource(target.toUri());

            if (!resource.exists() || !resource.isReadable()) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Resultado del probador virtual no encontrado."
                );
            }

            return new LoadedResult(
                    resource,
                    contentTypeFromKey(storageKey),
                    Files.size(target)
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo leer el resultado "
                    + "del probador virtual.",
                    ex
            );
        }
    }

    @Override
    public void delete(String storageKey) {
        Path target = resolve(storageKey);

        try {
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
            // Cleanup best effort.
        }
    }

    private Path resolve(String storageKey) {
        if (
                storageKey == null
                || !storageKey.matches(
                        "^[0-9a-fA-F-]{36}\\.(jpg|png|webp)$"
                )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Resultado del probador virtual no encontrado."
            );
        }

        Path target =
                root.resolve(storageKey)
                        .normalize();

        if (!target.startsWith(root)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Resultado del probador virtual no encontrado."
            );
        }

        return target;
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
                "El proveedor devolvió un resultado "
                + "que no es PNG, JPG/JPEG o WEBP válido."
        );
    }

    private String contentTypeFromKey(
            String storageKey
    ) {
        if (storageKey.endsWith(".png")) {
            return "image/png";
        }

        if (storageKey.endsWith(".webp")) {
            return "image/webp";
        }

        return "image/jpeg";
    }

    private record DetectedImage(
            String contentType,
            String extension
    ) {}
}
