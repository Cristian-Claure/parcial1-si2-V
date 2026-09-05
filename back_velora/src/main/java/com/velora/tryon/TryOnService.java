package com.velora.tryon;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.velora.catalog.asset.CatalogAssetStorage;
import com.velora.catalog.image.ProductImageEntity;
import com.velora.catalog.image.ProductImagePurpose;
import com.velora.catalog.image.ProductImageRepository;
import com.velora.catalog.product.ProductEntity;
import com.velora.catalog.product.ProductRepository;
import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.catalog.variant.ProductVariantRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

@Service
public class TryOnService {

    private static final String GENERIC_PROVIDER_ERROR =
            "No se pudo completar el probador virtual.";

    private final TryOnJobRepository jobs;
    private final UserRepository users;
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final ProductImageRepository images;
    private final CatalogAssetStorage catalogStorage;
    private final TryOnResultStorage resultStorage;
    private final TryOnAiClient aiClient;
    private final HttpClient downloadClient;
    private final String defaultProvider;
    private final long maxInputBytes;
    private final long maxResultBytes;

    public TryOnService(
            TryOnJobRepository jobs,
            UserRepository users,
            ProductRepository products,
            ProductVariantRepository variants,
            ProductImageRepository images,
            CatalogAssetStorage catalogStorage,
            TryOnResultStorage resultStorage,
            TryOnAiClient aiClient,
            @Value(
                "${velora.tryon.default-provider:replicate}"
            )
            String defaultProvider,
            @Value(
                "${velora.tryon.max-input-bytes:5242880}"
            )
            long maxInputBytes,
            @Value(
                "${velora.tryon.results.max-bytes:12582912}"
            )
            long maxResultBytes
    ) {
        if (
                maxInputBytes <= 0
                || maxInputBytes >= Integer.MAX_VALUE
        ) {
            throw new IllegalStateException(
                    "velora.tryon.max-input-bytes "
                    + "debe ser positivo y menor a 2 GB."
            );
        }

        if (
                maxResultBytes <= 0
                || maxResultBytes >= Integer.MAX_VALUE
        ) {
            throw new IllegalStateException(
                    "velora.tryon.results.max-bytes "
                    + "debe ser positivo y menor a 2 GB."
            );
        }

        this.jobs = jobs;
        this.users = users;
        this.products = products;
        this.variants = variants;
        this.images = images;
        this.catalogStorage = catalogStorage;
        this.resultStorage = resultStorage;
        this.aiClient = aiClient;
        this.defaultProvider = defaultProvider;
        this.maxInputBytes = maxInputBytes;
        this.maxResultBytes = maxResultBytes;
        this.downloadClient =
                HttpClient.newBuilder()
                        .connectTimeout(
                                Duration.ofSeconds(10)
                        )
                        .followRedirects(
                                HttpClient.Redirect.NORMAL
                        )
                        .build();
    }

    public TryOnJobResponse create(
            UUID userId,
            UUID productId,
            UUID variantId,
            String providerValue,
            MultipartFile person
    ) {
        requireCustomer(userId);

        ProductEntity product =
                requireTryOnProduct(productId);

        ProductVariantEntity variant =
                resolveVariant(
                        productId,
                        variantId
                );

        ProductImageEntity garment =
                resolveGarment(
                        productId,
                        variant == null
                                ? null
                                : variant.getId()
                );

        String storageKey =
                requireManagedStorageKey(garment);

        ValidatedImage personImage =
                validatePerson(person);

        CatalogAssetStorage.LoadedAsset loaded =
                catalogStorage.load(storageKey);

        byte[] garmentBytes =
                readCatalogAsset(
                        loaded,
                        maxInputBytes
                );

        String garmentContentType =
                detectImage(
                        garmentBytes,
                        "La prenda del catálogo",
                        HttpStatus.BAD_REQUEST
                );

        TryOnProviderName provider =
                TryOnProviderName.parse(
                        providerValue,
                        defaultProvider
                );

        TryOnJobEntity job =
                new TryOnJobEntity();

        job.setUserId(userId);
        job.setProductId(productId);
        job.setVariantId(
                variant == null
                        ? null
                        : variant.getId()
        );
        job.setGarmentImageId(
                garment.getId()
        );
        job.setProvider(provider);
        job.setStatus(
                TryOnJobStatus.QUEUED
        );

        job = jobs.saveAndFlush(job);

        try {
            TryOnAiClient.FastApiTryOnJob external =
                    aiClient.submit(
                            provider,
                            product.getTryOnCategory().name(),
                            personImage.bytes(),
                            personImage.contentType(),
                            personImage.filename(),
                            garmentBytes,
                            garmentContentType,
                            storageKey
                    );

            applyProviderResponse(
                    job,
                    external
            );

            return toResponse(
                    jobs.saveAndFlush(job)
            );
        } catch (ResponseStatusException ex) {
            markFailed(job);
            jobs.saveAndFlush(job);
            throw ex;
        } catch (RuntimeException ex) {
            markFailed(job);
            jobs.saveAndFlush(job);

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    GENERIC_PROVIDER_ERROR,
                    ex
            );
        }
    }

    public TryOnJobResponse get(
            UUID userId,
            UUID jobId
    ) {
        requireCustomer(userId);

        TryOnJobEntity job =
                requireOwnedJob(
                        userId,
                        jobId
                );

        if (
                !job.getStatus().terminal()
                && job.getExternalJobId() != null
                && !job.getExternalJobId().isBlank()
        ) {
            try {
                applyProviderResponse(
                        job,
                        aiClient.get(
                                job.getProvider(),
                                job.getExternalJobId()
                        )
                );

                job = jobs.saveAndFlush(job);
            } catch (ResponseStatusException ex) {
                throw ex;
            } catch (RuntimeException ex) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "No se pudo actualizar el estado "
                        + "del probador virtual.",
                        ex
                );
            }
        }

        return toResponse(job);
    }

    public TryOnJobResponse cancel(
            UUID userId,
            UUID jobId
    ) {
        requireCustomer(userId);

        TryOnJobEntity job =
                requireOwnedJob(
                        userId,
                        jobId
                );

        if (job.getStatus().terminal()) {
            return toResponse(job);
        }

        if (
                job.getExternalJobId() == null
                || job.getExternalJobId().isBlank()
        ) {
            job.setStatus(
                    TryOnJobStatus.CANCELLED
            );
            job.setCompletedAt(Instant.now());

            return toResponse(
                    jobs.saveAndFlush(job)
            );
        }

        applyProviderResponse(
                job,
                aiClient.cancel(
                        job.getProvider(),
                        job.getExternalJobId()
                )
        );

        return toResponse(
                jobs.saveAndFlush(job)
        );
    }

    public TryOnResultStorage.LoadedResult result(
            UUID userId,
            UUID jobId
    ) {
        requireCustomer(userId);

        TryOnJobEntity job =
                requireOwnedJob(
                        userId,
                        jobId
                );

        if (
                job.getStatus()
                        != TryOnJobStatus.SUCCEEDED
                || job.getResultStorageKey() == null
        ) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El resultado del probador virtual "
                    + "todavía no está disponible."
            );
        }

        return resultStorage.load(
                job.getResultStorageKey()
        );
    }

    private void applyProviderResponse(
            TryOnJobEntity job,
            TryOnAiClient.FastApiTryOnJob external
    ) {
        TryOnProviderName responseProvider;

        try {
            responseProvider =
                    TryOnProviderName.valueOf(
                            external.provider()
                                    .trim()
                                    .toUpperCase(Locale.ROOT)
                    );
        } catch (
                NullPointerException
                | IllegalArgumentException ex
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un proveedor "
                    + "no reconocido.",
                    ex
            );
        }

        if (responseProvider != job.getProvider()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un proveedor "
                    + "distinto al solicitado."
            );
        }

        if (
                job.getExternalJobId() != null
                && !job.getExternalJobId()
                        .equals(external.jobId())
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un identificador "
                    + "de job inconsistente."
            );
        }

        job.setExternalJobId(
                external.jobId().trim()
        );

        if (external.durationMs() != null) {
            job.setDurationMs(
                    Math.max(
                            0L,
                            external.durationMs()
                    )
            );
        }

        TryOnJobStatus status =
                parseStatus(
                        external.status()
                );

        if (status == TryOnJobStatus.SUCCEEDED) {
            persistSuccessfulResult(
                    job,
                    external.resultUrl()
            );
            return;
        }

        job.setStatus(status);

        if (status == TryOnJobStatus.FAILED) {
            job.setErrorMessage(
                    GENERIC_PROVIDER_ERROR
            );
            job.setCompletedAt(Instant.now());
        } else if (
                status == TryOnJobStatus.CANCELLED
        ) {
            job.setErrorMessage(null);
            job.setCompletedAt(Instant.now());
        }
    }

    private void persistSuccessfulResult(
            TryOnJobEntity job,
            String externalResultUrl
    ) {
        if (job.getResultStorageKey() != null) {
            job.setStatus(
                    TryOnJobStatus.SUCCEEDED
            );

            if (job.getCompletedAt() == null) {
                job.setCompletedAt(
                        Instant.now()
                );
            }

            return;
        }

        if (
                externalResultUrl == null
                || externalResultUrl.isBlank()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El proveedor finalizó sin entregar "
                    + "una imagen de resultado."
            );
        }

        byte[] resultBytes =
                downloadResult(
                        externalResultUrl.trim()
                );

        TryOnResultStorage.StoredResult stored =
                resultStorage.store(
                        resultBytes
                );

        job.setResultStorageKey(
                stored.storageKey()
        );
        job.setResultContentType(
                stored.contentType()
        );
        job.setResultSizeBytes(
                stored.sizeBytes()
        );
        job.setStatus(
                TryOnJobStatus.SUCCEEDED
        );
        job.setErrorMessage(null);
        job.setCompletedAt(
                Instant.now()
        );
    }

    private byte[] downloadResult(
            String resultUrl
    ) {
        URI uri;

        try {
            uri = URI.create(resultUrl);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El proveedor devolvió una URL "
                    + "de resultado inválida.",
                    ex
            );
        }

        String scheme =
                uri.getScheme() == null
                        ? ""
                        : uri.getScheme()
                                .toLowerCase(Locale.ROOT);

        if (
                !"http".equals(scheme)
                && !"https".equals(scheme)
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "El proveedor devolvió una URL "
                    + "de resultado no soportada."
            );
        }

        try {
            HttpRequest request =
                    HttpRequest.newBuilder(uri)
                            .timeout(
                                    Duration.ofSeconds(60)
                            )
                            .GET()
                            .build();

            HttpResponse<InputStream> response =
                    downloadClient.send(
                            request,
                            HttpResponse.BodyHandlers
                                    .ofInputStream()
                    );

            if (
                    response.statusCode() < 200
                    || response.statusCode() >= 300
            ) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "No se pudo descargar el resultado "
                        + "del proveedor."
                );
            }

            try (InputStream input = response.body()) {
                byte[] bytes =
                        input.readNBytes(
                                (int) maxResultBytes + 1
                        );

                if (bytes.length > maxResultBytes) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY,
                            "El resultado del proveedor "
                            + "supera el límite permitido."
                    );
                }

                detectImage(
                        bytes,
                        "El resultado del proveedor",
                        HttpStatus.BAD_GATEWAY
                );

                return bytes;
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();

            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Se interrumpió la descarga del resultado.",
                    ex
            );
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "No se pudo descargar el resultado "
                    + "del proveedor.",
                    ex
            );
        }
    }

    private ProductImageEntity resolveGarment(
            UUID productId,
            UUID variantId
    ) {
        List<ProductImageEntity> candidates;

        if (variantId == null) {
            candidates =
                    images.findAllByProductIdAndPurposeOrderBySortOrderAsc(
                            productId,
                            ProductImagePurpose.TRY_ON_GARMENT
                    );
        } else {
            candidates =
                    images.findAllByProductIdAndVariantIdAndPurposeOrderBySortOrderAsc(
                            productId,
                            variantId,
                            ProductImagePurpose.TRY_ON_GARMENT
                    );
        }

        candidates =
                candidates.stream()
                        .filter(
                                image ->
                                        image.getStorageKey()
                                                != null
                                                && !image.getStorageKey()
                                                        .isBlank()
                        )
                        .toList();

        if (candidates.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La variante seleccionada no tiene "
                    + "una prenda administrada para el probador virtual."
            );
        }

        if (candidates.size() > 1) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    variantId == null
                            ? "Seleccione una variante para usar "
                              + "el probador virtual."
                            : "La variante tiene más de una imagen "
                              + "TRY_ON_GARMENT administrada."
            );
        }

        return candidates.getFirst();
    }

    private ProductEntity requireTryOnProduct(
            UUID productId
    ) {
        ProductEntity product =
                products.findById(productId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Producto no encontrado."
                                        )
                        );

        if (
                product.getStatus()
                        != ProductStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Producto no encontrado."
            );
        }

        if (
                !product.isTryOnEnabled()
                || product.getTryOnCategory() == null
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El producto no está disponible "
                    + "para el probador virtual."
            );
        }

        return product;
    }

    private ProductVariantEntity resolveVariant(
            UUID productId,
            UUID variantId
    ) {
        if (variantId == null) {
            return null;
        }

        ProductVariantEntity variant =
                variants.findByIdAndProductId(
                        variantId,
                        productId
                )
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "La variante no pertenece "
                                        + "al producto indicado."
                                )
                );

        if (!variant.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La variante seleccionada está inactiva."
            );
        }

        return variant;
    }

    private void requireCustomer(UUID userId) {
        UserEntity user =
                users.findById(userId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.UNAUTHORIZED,
                                                "Usuario autenticado "
                                                + "no encontrado."
                                        )
                        );

        if (
                user.getStatus()
                        != UserStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        if (user.getRole() != UserRole.CUSTOMER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El probador virtual está disponible "
                    + "únicamente para clientes."
            );
        }
    }

    private TryOnJobEntity requireOwnedJob(
            UUID userId,
            UUID jobId
    ) {
        return jobs.findByIdAndUserId(
                jobId,
                userId
        )
        .orElseThrow(
                () ->
                        new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Job del probador virtual "
                                + "no encontrado."
                        )
        );
    }

    private ValidatedImage validatePerson(
            MultipartFile file
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Seleccione una foto para usar "
                    + "el probador virtual."
            );
        }

        if (file.getSize() > maxInputBytes) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "La foto supera el límite "
                    + "del probador virtual."
            );
        }

        byte[] bytes;

        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No se pudo leer la foto enviada.",
                    ex
            );
        }

        String contentType =
                detectImage(
                        bytes,
                        "La foto",
                        HttpStatus.BAD_REQUEST
                );

        String reported =
                file.getContentType() == null
                        ? ""
                        : file.getContentType()
                                .trim()
                                .toLowerCase(Locale.ROOT);

        if ("image/jpg".equals(reported)) {
            reported = "image/jpeg";
        }

        if (
                !reported.isBlank()
                && !reported.equals(contentType)
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El tipo declarado de la foto "
                    + "no coincide con su contenido."
            );
        }

        String filename =
                "person."
                + extensionFor(contentType);

        return new ValidatedImage(
                bytes,
                contentType,
                filename
        );
    }

    private byte[] readCatalogAsset(
            CatalogAssetStorage.LoadedAsset loaded,
            long maxBytes
    ) {
        try (InputStream input =
                     loaded.resource()
                             .getInputStream()) {
            byte[] bytes =
                    input.readNBytes(
                            (int) maxBytes + 1
                    );

            if (bytes.length > maxBytes) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "La prenda administrada supera "
                        + "el límite del probador virtual."
                );
            }

            return bytes;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "No se pudo leer la prenda "
                    + "administrada del catálogo.",
                    ex
            );
        }
    }

    private String requireManagedStorageKey(
            ProductImageEntity garment
    ) {
        String storageKey =
                garment.getStorageKey();

        if (
                storageKey == null
                || storageKey.isBlank()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La prenda del probador virtual "
                    + "no está administrada por VÉLORA."
            );
        }

        return storageKey.trim();
    }

    private TryOnJobStatus parseStatus(
            String value
    ) {
        try {
            return TryOnJobStatus.valueOf(
                    value.trim()
                            .toUpperCase(Locale.ROOT)
            );
        } catch (
                NullPointerException
                | IllegalArgumentException ex
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un estado "
                    + "de job no reconocido.",
                    ex
            );
        }
    }

    private String detectImage(
            byte[] bytes,
            String label,
            HttpStatus invalidStatus
    ) {
        if (
                bytes != null
                && bytes.length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A
        ) {
            return "image/png";
        }

        if (
                bytes != null
                && bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF
        ) {
            return "image/jpeg";
        }

        if (
                bytes != null
                && bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P'
        ) {
            return "image/webp";
        }

        throw new ResponseStatusException(
                invalidStatus,
                label
                + " debe ser una imagen PNG, "
                + "JPG/JPEG o WEBP válida."
        );
    }

    private String extensionFor(
            String contentType
    ) {
        return switch (contentType) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> "jpg";
        };
    }

    private void markFailed(
            TryOnJobEntity job
    ) {
        job.setStatus(
                TryOnJobStatus.FAILED
        );
        job.setErrorMessage(
                GENERIC_PROVIDER_ERROR
        );
        job.setCompletedAt(
                Instant.now()
        );
    }

    private TryOnJobResponse toResponse(
            TryOnJobEntity job
    ) {
        String resultUrl =
                job.getResultStorageKey() == null
                        ? null
                        : "/api/customer/try-on/jobs/"
                          + job.getId()
                          + "/result";

        return new TryOnJobResponse(
                job.getId(),
                job.getProductId(),
                job.getVariantId(),
                job.getProvider().name(),
                job.getStatus().name(),
                resultUrl,
                job.getErrorMessage(),
                job.getDurationMs(),
                job.getCreatedAt(),
                job.getUpdatedAt(),
                job.getCompletedAt()
        );
    }

    private record ValidatedImage(
            byte[] bytes,
            String contentType,
            String filename
    ) {}
}
