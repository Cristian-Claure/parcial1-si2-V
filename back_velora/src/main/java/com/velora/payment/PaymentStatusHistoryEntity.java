package com.velora.payment;

import java.time.Instant;
import java.util.UUID;

import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "payment_status_history")
public class PaymentStatusHistoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false)
    private PaymentEntity payment;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 20)
    private PaymentStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 20)
    private PaymentStatus toStatus;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false)
    private UserEntity changedBy;

    @Column(length = 500)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();

        if (reason != null) {
            reason = reason.trim();

            if (reason.isBlank()) {
                reason = null;
            }
        }
    }

    public UUID getId() { return id; }

    public PaymentEntity getPayment() { return payment; }
    public void setPayment(PaymentEntity payment) {
        this.payment = payment;
    }

    public PaymentStatus getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(PaymentStatus fromStatus) {
        this.fromStatus = fromStatus;
    }

    public PaymentStatus getToStatus() {
        return toStatus;
    }

    public void setToStatus(PaymentStatus toStatus) {
        this.toStatus = toStatus;
    }

    public UserEntity getChangedBy() { return changedBy; }
    public void setChangedBy(UserEntity changedBy) {
        this.changedBy = changedBy;
    }

    public String getReason() { return reason; }
    public void setReason(String reason) {
        this.reason = reason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}