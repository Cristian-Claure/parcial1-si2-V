package com.velora.inventory;

import java.time.Instant;
import java.util.UUID;

import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "inventory_movements")
public class InventoryMovementEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private WarehouseEntity warehouse;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariantEntity variant;

    @Enumerated(EnumType.STRING)
    @Column(name = "movement_type", nullable = false, length = 30)
    private InventoryMovementType movementType;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "physical_delta", nullable = false)
    private int physicalDelta;

    @Column(name = "committed_delta", nullable = false)
    private int committedDelta;

    @Column(name = "physical_before", nullable = false)
    private int physicalBefore;

    @Column(name = "physical_after", nullable = false)
    private int physicalAfter;

    @Column(name = "committed_before", nullable = false)
    private int committedBefore;

    @Column(name = "committed_after", nullable = false)
    private int committedAfter;

    @Column(name = "reference_type", length = 40)
    private String referenceType;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(length = 500)
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "performed_by")
    private UserEntity performedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() { return id; }

    public WarehouseEntity getWarehouse() { return warehouse; }
    public void setWarehouse(WarehouseEntity warehouse) { this.warehouse = warehouse; }

    public ProductVariantEntity getVariant() { return variant; }
    public void setVariant(ProductVariantEntity variant) { this.variant = variant; }

    public InventoryMovementType getMovementType() { return movementType; }
    public void setMovementType(InventoryMovementType movementType) { this.movementType = movementType; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public int getPhysicalDelta() { return physicalDelta; }
    public void setPhysicalDelta(int physicalDelta) { this.physicalDelta = physicalDelta; }

    public int getCommittedDelta() { return committedDelta; }
    public void setCommittedDelta(int committedDelta) { this.committedDelta = committedDelta; }

    public int getPhysicalBefore() { return physicalBefore; }
    public void setPhysicalBefore(int physicalBefore) { this.physicalBefore = physicalBefore; }

    public int getPhysicalAfter() { return physicalAfter; }
    public void setPhysicalAfter(int physicalAfter) { this.physicalAfter = physicalAfter; }

    public int getCommittedBefore() { return committedBefore; }
    public void setCommittedBefore(int committedBefore) { this.committedBefore = committedBefore; }

    public int getCommittedAfter() { return committedAfter; }
    public void setCommittedAfter(int committedAfter) { this.committedAfter = committedAfter; }

    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }

    public UUID getReferenceId() { return referenceId; }
    public void setReferenceId(UUID referenceId) { this.referenceId = referenceId; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public UserEntity getPerformedBy() { return performedBy; }
    public void setPerformedBy(UserEntity performedBy) { this.performedBy = performedBy; }

    public Instant getCreatedAt() { return createdAt; }
}