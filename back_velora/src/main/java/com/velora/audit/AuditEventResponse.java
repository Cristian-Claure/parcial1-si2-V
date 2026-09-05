package com.velora.audit;

import java.time.Instant;
import java.util.UUID;

public record AuditEventResponse(
        UUID id,
        Instant occurredAt,
        UUID actorUserId,
        String actorEmail,
        String actorName,
        String actorRole,
        String category,
        String httpMethod,
        String routePattern,
        String requestPath,
        int statusCode,
        boolean success,
        String requestId
) {
    static AuditEventResponse from(AuditEventEntity event) {
        return new AuditEventResponse(
                event.getId(),
                event.getOccurredAt(),
                event.getActorUserId(),
                event.getActorEmail(),
                event.getActorName(),
                event.getActorRole(),
                event.getCategory(),
                event.getHttpMethod(),
                event.getRoutePattern(),
                event.getRequestPath(),
                event.getStatusCode(),
                event.isSuccess(),
                event.getRequestId()
        );
    }
}
