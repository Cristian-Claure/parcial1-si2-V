package com.velora.audit;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

@Component
public class AuditMutationInterceptor
        implements HandlerInterceptor {

    private static final Logger log =
            LoggerFactory.getLogger(
                    AuditMutationInterceptor.class
            );

    private static final Set<String> MUTATION_METHODS =
            Set.of(
                    "POST",
                    "PUT",
                    "PATCH",
                    "DELETE"
            );

    private final AuditEventService audit;

    public AuditMutationInterceptor(
            AuditEventService audit
    ) {
        this.audit = audit;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception exception
    ) {
        String method = request.getMethod()
                .toUpperCase(Locale.ROOT);

        if (!MUTATION_METHODS.contains(method)) {
            return;
        }

        String path = request.getRequestURI();

        if (
                path == null
                || !path.startsWith("/api/")
                || path.startsWith("/api/auth/")
        ) {
            return;
        }

        int status = response.getStatus();

        if (status < 200 || status >= 400) {
            /*
             * P12A registra mutaciones exitosas.
             * Intentos fallidos/denegados pertenecen
             * al bloque de seguridad P12B.
             */
            return;
        }

        Actor actor = actor();
        String routePattern = routePattern(request, path);
        String requestId = request.getHeader("X-Request-Id");

        try {
            audit.record(
                    actor.userId(),
                    actor.role(),
                    category(routePattern),
                    method,
                    routePattern,
                    path,
                    status,
                    requestId
            );
        } catch (Exception auditFailure) {
            /*
             * Una falla de bitácora nunca debe
             * convertir una operación de negocio
             * ya exitosa en un error HTTP.
             */
            log.error(
                    "No se pudo registrar auditoría; method={} path={}",
                    method,
                    path,
                    auditFailure
            );
        }
    }

    private Actor actor() {
        Authentication authentication =
                SecurityContextHolder
                        .getContext()
                        .getAuthentication();

        if (
                authentication == null
                || !authentication.isAuthenticated()
        ) {
            return Actor.ANONYMOUS;
        }

        Object principal = authentication.getPrincipal();

        if (!(principal instanceof Jwt jwt)) {
            return Actor.ANONYMOUS;
        }

        UUID userId = null;

        try {
            String subject = jwt.getSubject();

            if (subject != null && !subject.isBlank()) {
                userId = UUID.fromString(subject);
            }
        } catch (IllegalArgumentException ignored) {
            userId = null;
        }

        String role = jwt.getClaimAsString("role");

        return new Actor(
                userId,
                role == null || role.isBlank()
                        ? "AUTHENTICATED"
                        : role.trim().toUpperCase(Locale.ROOT)
        );
    }

    private String routePattern(
            HttpServletRequest request,
            String fallback
    ) {
        Object pattern = request.getAttribute(
                HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE
        );

        if (pattern == null) {
            return fallback;
        }

        String value = pattern.toString().trim();

        return value.isBlank()
                ? fallback
                : value;
    }

    private String category(String route) {
        String normalized = route.toLowerCase(Locale.ROOT);

        if (
                normalized.startsWith("/api/admin")
                || normalized.startsWith("/api/manager")
        ) {
            if (normalized.contains("/orders")) {
                return "ORDERS";
            }
            if (normalized.contains("/payments")) {
                return "PAYMENTS";
            }
            if (
                    normalized.contains("/pos")
                    || normalized.contains("/cash")
            ) {
                return "POS";
            }
            if (normalized.contains("/reports")) {
                return "REPORTS_AI";
            }
            return "ADMIN";
        }

        if (normalized.startsWith("/api/catalog")) {
            return "CATALOG";
        }

        if (normalized.startsWith("/api/inventory")) {
            return "INVENTORY";
        }

        if (normalized.contains("/orders")) {
            return "ORDERS";
        }

        if (normalized.contains("/payments")) {
            return "PAYMENTS";
        }

        if (normalized.contains("/try-on")) {
            return "TRY_ON";
        }

        if (
                normalized.contains("/assistant")
                || normalized.contains("/reports")
        ) {
            return "REPORTS_AI";
        }

        if (normalized.contains("/push")) {
            return "PUSH";
        }

        if (normalized.startsWith("/api/customer")) {
            return "CUSTOMER";
        }

        return "OTHER";
    }

    private record Actor(
            UUID userId,
            String role
    ) {
        private static final Actor ANONYMOUS =
                new Actor(null, "ANONYMOUS");
    }
}
