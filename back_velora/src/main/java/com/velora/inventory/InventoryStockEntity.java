package com.velora.inventory;

import java.time.Instant;
import java.util.UUID;

import com.velora.catalog.variant.ProductVariantEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "inventory_stocks")
public class InventoryStockEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private WarehouseEntity warehouse;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariantEntity variant;

    @Column(name = "physical_quantity", nullable = false)
    private int physicalQuantity;

    @Column(name = "committed_quantity", nullable = false)
    private int committedQuantity;

    @Column(
        name = "available_quantity",
        insertable = false,
        updatable = false
    )
    private Integer availableQuantity;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

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

    public WarehouseEntity getWarehouse() { return warehouse; }
    public void setWarehouse(WarehouseEntity warehouse) { this.warehouse = warehouse; }

    public ProductVariantEntity getVariant() { return variant; }
    public void setVariant(ProductVariantEntity variant) { this.variant = variant; }

    public int getPhysicalQuantity() { return physicalQuantity; }
    public void setPhysicalQuantity(int physicalQuantity) {
        this.physicalQuantity = physicalQuantity;
    }

    public int getCommittedQuantity() { return committedQuantity; }
    public void setCommittedQuantity(int committedQuantity) {
        this.committedQuantity = committedQuantity;
    }

    public int getAvailableQuantity() {
        return physicalQuantity - committedQuantity;
    }

    public long getVersion() { return version; }
}