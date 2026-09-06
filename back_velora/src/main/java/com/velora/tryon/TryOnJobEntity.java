package com.velora.tryon;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.*;

@Entity
@Table(name = "try_on_jobs")
public class TryOnJobEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "variant_id")
    private UUID variantId;

    @Column(name = "garment_image_id", nullable = false)
    private UUID garmentImageId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TryOnProviderName provider;

    @Column(name = "external_job_id", length = 255)
    private String externalJobId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TryOnJobStatus status;

    @Column(name = "result_storage_key", length = 120)
    private String resultStorageKey;

    @Column(name = "result_content_type", length = 60)
    private String resultContentType;

    @Column(name = "result_size_bytes")
    private Long resultSizeBytes;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public UUID getProductId() { return productId; }
    public void setProductId(UUID productId) { this.productId = productId; }

    public UUID getVariantId() { return variantId; }
    public void setVariantId(UUID variantId) { this.variantId = variantId; }

    public UUID getGarmentImageId() { return garmentImageId; }
    public void setGarmentImageId(UUID garmentImageId) {
        this.garmentImageId = garmentImageId;
    }

    public TryOnProviderName getProvider() { return provider; }
    public void setProvider(TryOnProviderName provider) {
        this.provider = provider;
    }

    public String getExternalJobId() { return externalJobId; }
    public void setExternalJobId(String externalJobId) {
        this.externalJobId = externalJobId;
    }

    public TryOnJobStatus getStatus() { return status; }
    public void setStatus(TryOnJobStatus status) {
        this.status = status;
    }

    public String getResultStorageKey() { return resultStorageKey; }
    public void setResultStorageKey(String resultStorageKey) {
        this.resultStorageKey = resultStorageKey;
    }

    public String getResultContentType() { return resultContentType; }
    public void setResultContentType(String resultContentType) {
        this.resultContentType = resultContentType;
    }

    public Long getResultSizeBytes() { return resultSizeBytes; }
    public void setResultSizeBytes(Long resultSizeBytes) {
        this.resultSizeBytes = resultSizeBytes;
    }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) {
        this.durationMs = durationMs;
    }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }
}
