package com.velora.pos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "cash_movements")
public class CashMovementEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "cash_session_id",
            nullable = false
    )
    private CashSessionEntity cashSession;

    @Enumerated(EnumType.STRING)
    @Column(
            name = "movement_type",
            nullable = false,
            length = 20
    )
    private CashMovementType movementType;

    @Column(
            nullable = false,
            precision = 12,
            scale = 2
    )
    private BigDecimal amount;

    @Column(nullable = false, length = 500)
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private UserEntity createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();

        reason = reason == null
                ? null
                : reason.trim();
    }

    public UUID getId() { return id; }

    public CashSessionEntity getCashSession() {
        return cashSession;
    }

    public void setCashSession(
            CashSessionEntity cashSession
    ) {
        this.cashSession = cashSession;
    }

    public CashMovementType getMovementType() {
        return movementType;
    }

    public void setMovementType(
            CashMovementType movementType
    ) {
        this.movementType = movementType;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(
            BigDecimal amount
    ) {
        this.amount = amount;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(
            String reason
    ) {
        this.reason = reason;
    }

    public UserEntity getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(
            UserEntity createdBy
    ) {
        this.createdBy = createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}