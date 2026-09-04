package com.velora.catalog.asset;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.velora.catalog.CatalogService;
import com.velora.catalog.dto.ImageRequest;
import com.velora.catalog.dto.ImageResponse;
import com.velora.catalog.image.ProductImagePurpose;

@Service
public class CatalogAssetService {

    private final CatalogAssetStorage storage;
    private final CatalogService catalogService;

    public CatalogAssetService(
            CatalogAssetStorage storage,
            CatalogService catalogService
    ) {
        this.storage = storage;
        this.catalogService = catalogService;
    }

    public ImageResponse uploadProductImage(
            UUID productId,
            UUID variantId,
            String altText,
            ProductImagePurpose purpose,
            Integer sortOrder,
            Boolean primary,
            MultipartFile file
    ) {
        validateMetadata(altText, sortOrder);

        CatalogAssetStorage.StoredAsset stored =
                storage.store(file);

        try {
            return catalogService.createImage(
                    productId,
                    new ImageRequest(
                            variantId,
                            stored.publicUrl(),
                            normalizeAltText(altText),
                            purpose == null
                                    ? ProductImagePurpose.GALLERY
                                    : purpose,
                            sortOrder == null ? 0 : sortOrder,
                            Boolean.TRUE.equals(primary)
                    )
            );
        } catch (RuntimeException ex) {
            storage.delete(stored.storageKey());
            throw ex;
        }
    }

    public CatalogAssetStorage.LoadedAsset load(
            String storageKey
    ) {
        return storage.load(storageKey);
    }

    private void validateMetadata(
            String altText,
            Integer sortOrder
    ) {
        if (altText != null && altText.trim().length() > 250) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El texto alternativo no puede superar 250 caracteres."
            );
        }

        if (sortOrder != null && sortOrder < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El orden de la imagen no puede ser negativo."
            );
        }
    }

    private String normalizeAltText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
