package com.velora.audit;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.velora.user.UserEntity;
import com.velora.user.UserRepository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditEventService {

    private static final int MAX_PAGE_SIZE = 100;

    private final AuditEventRepository events;
    private final UserRepository users;

    public AuditEventService(
            AuditEventRepository events,
            UserRepository users
    ) {
        this.events = events;
        this.users = users;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            UUID actorUserId,
            String actorRole,
            String category,
            String httpMethod,
            String routePattern,
            String requestPath,
            int statusCode,
            String requestId
    ) {
        AuditEventEntity event = new AuditEventEntity();
        event.setOccurredAt(Instant.now());
        event.setActorUserId(actorUserId);

        ActorSnapshot snapshot = actorSnapshot(actorUserId);
        event.setActorEmail(snapshot.email());
        event.setActorName(snapshot.name());

        event.setActorRole(normalized(actorRole, "ANONYMOUS", 32));
        event.setCategory(normalized(category, "OTHER", 48));
        event.setHttpMethod(
                normalized(httpMethod, "POST", 8)
                        .toUpperCase(Locale.ROOT)
        );
        event.setRoutePattern(normalized(routePattern, "/", 512));
        event.setRequestPath(normalized(requestPath, "/", 512));
        event.setStatusCode(statusCode);
        event.setSuccess(statusCode >= 200 && statusCode < 400);
        event.setRequestId(nullableNormalized(requestId, 128));

        events.save(event);
    }

    @Transactional(readOnly = true)
    public AuditEventPageResponse search(
            UUID actorId,
            String role,
            String category,
            String method,
            Boolean success,
            Instant from,
            Instant to,
            String query,
            int page,
            int size
    ) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(
                Math.max(size, 1),
                MAX_PAGE_SIZE
        );

        PageRequest pageable = PageRequest.of(
                safePage,
                safeSize,
                Sort.by(
                        Sort.Direction.DESC,
                        "occurredAt"
                )
        );

        Specification<AuditEventEntity> specification =
                (
                        root,
                        criteriaQuery,
                        criteriaBuilder
                ) -> criteriaBuilder.conjunction();

        if (actorId != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.equal(
                            root.<UUID>get("actorUserId"),
                            actorId
                    )
            );
        }

        String roleFilter =
                nullableUpper(
                        role,
                        32
                );

        if (roleFilter != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.equal(
                            root.<String>get("actorRole"),
                            roleFilter
                    )
            );
        }

        String categoryFilter =
                nullableUpper(
                        category,
                        48
                );

        if (categoryFilter != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.equal(
                            root.<String>get("category"),
                            categoryFilter
                    )
            );
        }

        String methodFilter =
                nullableUpper(
                        method,
                        8
                );

        if (methodFilter != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.equal(
                            root.<String>get("httpMethod"),
                            methodFilter
                    )
            );
        }

        if (success != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.equal(
                            root.<Boolean>get("success"),
                            success
                    )
            );
        }

        if (from != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.greaterThanOrEqualTo(
                            root.<Instant>get("occurredAt"),
                            from
                    )
            );
        }

        if (to != null) {
            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.lessThanOrEqualTo(
                            root.<Instant>get("occurredAt"),
                            to
                    )
            );
        }

        String queryFilter =
                nullableNormalized(
                        query,
                        120
                );

        if (queryFilter != null) {
            String likePattern =
                    "%"
                    + queryFilter.toLowerCase(
                            Locale.ROOT
                    )
                    + "%";

            specification = specification.and(
                    (
                            root,
                            criteriaQuery,
                            criteriaBuilder
                    ) -> criteriaBuilder.or(
                            criteriaBuilder.like(
                                    criteriaBuilder.lower(
                                            root.<String>get("actorEmail")
                                    ),
                                    likePattern
                            ),
                            criteriaBuilder.like(
                                    criteriaBuilder.lower(
                                            root.<String>get("actorName")
                                    ),
                                    likePattern
                            ),
                            criteriaBuilder.like(
                                    criteriaBuilder.lower(
                                            root.<String>get("routePattern")
                                    ),
                                    likePattern
                            ),
                            criteriaBuilder.like(
                                    criteriaBuilder.lower(
                                            root.<String>get("requestPath")
                                    ),
                                    likePattern
                            )
                    )
            );
        }

        Page<AuditEventEntity> result =
                events.findAll(
                        specification,
                        pageable
                );

        return AuditEventPageResponse.from(
                result
        );
    }

    private ActorSnapshot actorSnapshot(UUID actorUserId) {
        if (actorUserId == null) {
            return ActorSnapshot.EMPTY;
        }

        return users.findById(actorUserId)
                .map(user -> new ActorSnapshot(
                        user.getEmail(),
                        displayName(user)
                ))
                .orElse(ActorSnapshot.EMPTY);
    }

    private String displayName(UserEntity user) {
        String first = user.getFirstName() == null
                ? ""
                : user.getFirstName().trim();

        String last = user.getLastName() == null
                ? ""
                : user.getLastName().trim();

        String joined = (first + " " + last).trim();

        return joined.isBlank()
                ? null
                : joined;
    }

    private String nullableUpper(String value, int maxLength) {
        String normalized = nullableNormalized(value, maxLength);

        return normalized == null
                ? null
                : normalized.toUpperCase(Locale.ROOT);
    }

    private String nullableNormalized(String value, int maxLength) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();

        if (normalized.isBlank()) {
            return null;
        }

        if (normalized.length() <= maxLength) {
            return normalized;
        }

        return normalized.substring(0, maxLength);
    }

    private String normalized(
            String value,
            String fallback,
            int maxLength
    ) {
        String normalized = nullableNormalized(
                value,
                maxLength
        );

        return normalized == null
                ? fallback
                : normalized;
    }

    private record ActorSnapshot(
            String email,
            String name
    ) {
        private static final ActorSnapshot EMPTY =
                new ActorSnapshot(null, null);
    }
}
