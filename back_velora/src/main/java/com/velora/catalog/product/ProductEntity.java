package com.velora.catalog.product;

import java.time.Instant;
import java.util.UUID;

import com.velora.catalog.category.CategoryEntity;
import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "products")
public class ProductEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private CategoryEntity category;

    @Column(nullable = false, length = 180)
    private String name;

    @Column(nullable = false, unique = true, length = 200)
    private String slug;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 120)
    private String brand = "VÉLORA";

    @Column(length = 500)
    private String composition;

    @Column(name = "care_instructions", length = 1000)
    private String careInstructions;

    @Column(name = "fit_notes", length = 500)
    private String fitNotes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProductStatus status = ProductStatus.ACTIVE;

    @Column(name = "try_on_enabled", nullable = false)
    private boolean tryOnEnabled = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "try_on_category", length = 30)
    private TryOnCategory tryOnCategory;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private UserEntity createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private UserEntity updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        normalize();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
        normalize();
    }

    private void normalize() {
        name = name == null ? null : name.trim();
        slug = slug == null ? null : slug.trim().toLowerCase();
        brand = brand == null || brand.isBlank() ? "VÉLORA" : brand.trim();
    }

    public UUID getId() { return id; }

    public CategoryEntity getCategory() { return category; }
    public void setCategory(CategoryEntity category) { this.category = category; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public String getComposition() { return composition; }
    public void setComposition(String composition) { this.composition = composition; }

    public String getCareInstructions() { return careInstructions; }
    public void setCareInstructions(String careInstructions) { this.careInstructions = careInstructions; }

    public String getFitNotes() { return fitNotes; }
    public void setFitNotes(String fitNotes) { this.fitNotes = fitNotes; }

    public ProductStatus getStatus() { return status; }
    public void setStatus(ProductStatus status) { this.status = status; }

    public boolean isTryOnEnabled() { return tryOnEnabled; }
    public void setTryOnEnabled(boolean tryOnEnabled) { this.tryOnEnabled = tryOnEnabled; }

    public TryOnCategory getTryOnCategory() { return tryOnCategory; }
    public void setTryOnCategory(TryOnCategory tryOnCategory) { this.tryOnCategory = tryOnCategory; }

    public UserEntity getCreatedBy() { return createdBy; }
    public void setCreatedBy(UserEntity createdBy) { this.createdBy = createdBy; }

    public UserEntity getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(UserEntity updatedBy) { this.updatedBy = updatedBy; }
}