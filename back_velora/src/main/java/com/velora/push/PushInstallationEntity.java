package com.velora.push;

import java.time.Instant;
import java.util.UUID;

import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(
        name = "push_installations",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_push_installations_platform_fid",
                columnNames = {
                        "platform",
                        "installation_id"
                }
        )
)
public class PushInstallationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(
            fetch = FetchType.LAZY,
            optional = false
    )
    @JoinColumn(
            name = "user_id",
            nullable = false
    )
    private UserEntity user;

    @Column(
            name = "installation_id",
            nullable = false,
            length = 255
    )
    private String installationId;

    @Enumerated(EnumType.STRING)
    @Column(
            nullable = false,
            length = 20
    )
    private PushPlatform platform;

    @Column(
            name = "device_label",
            length = 160
    )
    private String deviceLabel;

    @Column(nullable = false)
    private boolean active = true;

    @Column(
            name = "last_seen_at",
            nullable = false
    )
    private Instant lastSeenAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(
            name = "created_at",
            nullable = false
    )
    private Instant createdAt;

    @Column(
            name = "updated_at",
            nullable = false
    )
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();

        if (lastSeenAt == null) {
            lastSeenAt = now;
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
        installationId =
                installationId == null
                        ? null
                        : installationId.trim();

        if (deviceLabel != null) {
            deviceLabel =
                    deviceLabel.trim();

            if (deviceLabel.isEmpty()) {
                deviceLabel = null;
            }
        }
    }

    public UUID getId() {
        return id;
    }

    public UserEntity getUser() {
        return user;
    }

    public void setUser(
            UserEntity user
    ) {
        this.user = user;
    }

    public String getInstallationId() {
        return installationId;
    }

    public void setInstallationId(
            String installationId
    ) {
        this.installationId =
                installationId;
    }

    public PushPlatform getPlatform() {
        return platform;
    }

    public void setPlatform(
            PushPlatform platform
    ) {
        this.platform = platform;
    }

    public String getDeviceLabel() {
        return deviceLabel;
    }

    public void setDeviceLabel(
            String deviceLabel
    ) {
        this.deviceLabel = deviceLabel;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(
            boolean active
    ) {
        this.active = active;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(
            Instant lastSeenAt
    ) {
        this.lastSeenAt = lastSeenAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(
            Instant revokedAt
    ) {
        this.revokedAt = revokedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
