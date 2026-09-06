package com.velora.audit;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.*;

@Entity
@Table(name = "audit_events")
public class AuditEventEntity {

    @Id
    private UUID id;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_email", length = 254)
    private String actorEmail;

    @Column(name = "actor_name", length = 200)
    private String actorName;

    @Column(name = "actor_role", nullable = false, length = 32)
    private String actorRole;

    @Column(nullable = false, length = 48)
    private String category;

    @Column(name = "http_method", nullable = false, length = 8)
    private String httpMethod;

    @Column(name = "route_pattern", nullable = false, length = 512)
    private String routePattern;

    @Column(name = "request_path", nullable = false, length = 512)
    private String requestPath;

    @Column(name = "status_code", nullable = false)
    private int statusCode;

    @Column(nullable = false)
    private boolean success;

    @Column(name = "request_id", length = 128)
    private String requestId;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
    }

    public UUID getId() { return id; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public UUID getActorUserId() { return actorUserId; }
    public void setActorUserId(UUID actorUserId) { this.actorUserId = actorUserId; }
    public String getActorEmail() { return actorEmail; }
    public void setActorEmail(String actorEmail) { this.actorEmail = actorEmail; }
    public String getActorName() { return actorName; }
    public void setActorName(String actorName) { this.actorName = actorName; }
    public String getActorRole() { return actorRole; }
    public void setActorRole(String actorRole) { this.actorRole = actorRole; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }
    public String getRoutePattern() { return routePattern; }
    public void setRoutePattern(String routePattern) { this.routePattern = routePattern; }
    public String getRequestPath() { return requestPath; }
    public void setRequestPath(String requestPath) { this.requestPath = requestPath; }
    public int getStatusCode() { return statusCode; }
    public void setStatusCode(int statusCode) { this.statusCode = statusCode; }
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
}
