package com.velora.catalog.asset;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

public interface CatalogAssetStorage {

    StoredAsset store(MultipartFile file);

    LoadedAsset load(String storageKey);

    void delete(String storageKey);

    record StoredAsset(
            String storageKey,
            String publicUrl,
            String contentType,
            long sizeBytes
    ) {}

    record LoadedAsset(
            Resource resource,
            String contentType
    ) {}
}
