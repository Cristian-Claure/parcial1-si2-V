package com.velora.pos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "cash_sessions")
public class CashSessionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(
            name = "session_number",
            nullable = false,
            unique = true,
            length = 50
    )
    private String sessionNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "point_of_sale_id",
            nullable = false
    )
    private PointOfSaleEntity pointOfSale;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "opened_by", nullable = false)
    private UserEntity openedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "closed_by")
    private UserEntity closedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CashSessionStatus status;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(
            name = "opening_amount",
            nullable = false,
            precision = 12,
            scale = 2
    )
    private BigDecimal openingAmount;

    @Column(
            name = "expected_cash_amount",
            precision = 12,
            scale = 2
    )
    private BigDecimal expectedCashAmount;

    @Column(
            name = "counted_cash_amount",
            precision = 12,
            scale = 2
    )
    private BigDecimal countedCashAmount;

    @Column(
            name = "cash_difference",
            precision = 12,
            scale = 2
    )
    private BigDecimal cashDifference;

    @Column(
            name = "opening_notes",
            length = 500
    )
    private String openingNotes;

    @Column(
            name = "closing_notes",
            length = 500
    )
    private String closingNotes;

    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();

        if (openedAt == null) {
            openedAt = now;
        }

        if (status == null) {
            status = CashSessionStatus.OPEN;
        }

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
        sessionNumber = normalizeUpper(
                sessionNumber
        );

        currency = normalizeUpper(
                currency
        );

        openingNotes = normalizeOptional(
                openingNotes
        );

        closingNotes = normalizeOptional(
                closingNotes
        );
    }

    private String normalizeUpper(String value) {
        return value == null
                ? null
                : value.trim().toUpperCase();
    }

    private String normalizeOptional(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    public UUID getId() { return id; }

    public String getSessionNumber() {
        return sessionNumber;
    }

    public void setSessionNumber(
            String sessionNumber
    ) {
        this.sessionNumber = sessionNumber;
    }

    public PointOfSaleEntity getPointOfSale() {
        return pointOfSale;
    }

    public void setPointOfSale(
            PointOfSaleEntity pointOfSale
    ) {
        this.pointOfSale = pointOfSale;
    }

    public UserEntity getOpenedBy() {
        return openedBy;
    }

    public void setOpenedBy(
            UserEntity openedBy
    ) {
        this.openedBy = openedBy;
    }

    public UserEntity getClosedBy() {
        return closedBy;
    }

    public void setClosedBy(
            UserEntity closedBy
    ) {
        this.closedBy = closedBy;
    }

    public CashSessionStatus getStatus() {
        return status;
    }

    public void setStatus(
            CashSessionStatus status
    ) {
        this.status = status;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(
            String currency
    ) {
        this.currency = currency;
    }

    public BigDecimal getOpeningAmount() {
        return openingAmount;
    }

    public void setOpeningAmount(
            BigDecimal openingAmount
    ) {
        this.openingAmount = openingAmount;
    }

    public BigDecimal getExpectedCashAmount() {
        return expectedCashAmount;
    }

    public void setExpectedCashAmount(
            BigDecimal expectedCashAmount
    ) {
        this.expectedCashAmount =
                expectedCashAmount;
    }

    public BigDecimal getCountedCashAmount() {
        return countedCashAmount;
    }

    public void setCountedCashAmount(
            BigDecimal countedCashAmount
    ) {
        this.countedCashAmount =
                countedCashAmount;
    }

    public BigDecimal getCashDifference() {
        return cashDifference;
    }

    public void setCashDifference(
            BigDecimal cashDifference
    ) {
        this.cashDifference =
                cashDifference;
    }

    public String getOpeningNotes() {
        return openingNotes;
    }

    public void setOpeningNotes(
            String openingNotes
    ) {
        this.openingNotes = openingNotes;
    }

    public String getClosingNotes() {
        return closingNotes;
    }

    public void setClosingNotes(
            String closingNotes
    ) {
        this.closingNotes = closingNotes;
    }

    public Instant getOpenedAt() {
        return openedAt;
    }

    public void setOpenedAt(
            Instant openedAt
    ) {
        this.openedAt = openedAt;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(
            Instant closedAt
    ) {
        this.closedAt = closedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }
}