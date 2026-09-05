package com.velora.tryon;

import org.springframework.core.io.Resource;

public interface TryOnResultStorage {

    StoredResult store(byte[] bytes);

    LoadedResult load(String storageKey);

    void delete(String storageKey);

    record StoredResult(
            String storageKey,
            String contentType,
            long sizeBytes
    ) {}

    record LoadedResult(
            Resource resource,
            String contentType,
            long sizeBytes
    ) {}
}
