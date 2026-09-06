package com.velora.security;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class SecurityRateLimitFilter extends OncePerRequestFilter {

    private static final String AUTH_GROUP = "AUTH";
    private static final String EXPENSIVE_GROUP = "EXPENSIVE";
    private static final long CLEANUP_INTERVAL = 256L;

    private final int authMaxRequests;
    private final long authWindowSeconds;
    private final int expensiveMaxRequests;
    private final long expensiveWindowSeconds;
    private final boolean trustProxyHeaders;

    private final Map<String, WindowState> windows =
            new ConcurrentHashMap<>();

    private final AtomicLong requestCounter =
            new AtomicLong();

    public SecurityRateLimitFilter(
            @Value("${velora.security.rate-limit.auth.max-requests:10}")
            int authMaxRequests,
            @Value("${velora.security.rate-limit.auth.window-seconds:60}")
            long authWindowSeconds,
            @Value("${velora.security.rate-limit.expensive.max-requests:30}")
            int expensiveMaxRequests,
            @Value("${velora.security.rate-limit.expensive.window-seconds:60}")
            long expensiveWindowSeconds,
            @Value("${velora.security.rate-limit.trust-proxy-headers:false}")
            boolean trustProxyHeaders
    ) {
        this.authMaxRequests =
                positive(
                        authMaxRequests,
                        "auth.max-requests"
                );

        this.authWindowSeconds =
                positive(
                        authWindowSeconds,
                        "auth.window-seconds"
                );

        this.expensiveMaxRequests =
                positive(
                        expensiveMaxRequests,
                        "expensive.max-requests"
                );

        this.expensiveWindowSeconds =
                positive(
                        expensiveWindowSeconds,
                        "expensive.window-seconds"
                );

        this.trustProxyHeaders =
                trustProxyHeaders;
    }

    @Override
    protected boolean shouldNotFilter(
            HttpServletRequest request
    ) {
        if (!"POST".equalsIgnoreCase(
                request.getMethod()
        )) {
            return true;
        }

        return resolveRule(
                request.getRequestURI()
        ) == null;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        LimitRule rule =
                resolveRule(
                        request.getRequestURI()
                );

        if (rule == null) {
            filterChain.doFilter(
                    request,
                    response
            );
            return;
        }

        long now =
                Instant.now().getEpochSecond();

        String bucketKey =
                rule.group()
                + ":"
                + clientKey(request);

        Decision decision =
                register(
                        bucketKey,
                        rule,
                        now
                );

        cleanupIfNeeded(now);

        if (!decision.allowed()) {
            response.setStatus(
                    HttpStatus.TOO_MANY_REQUESTS.value()
            );

            response.setContentType(
                    MediaType.APPLICATION_JSON_VALUE
            );

            response.setCharacterEncoding(
                    "UTF-8"
            );

            response.setHeader(
                    "Retry-After",
                    String.valueOf(
                            decision.retryAfterSeconds()
                    )
            );

            response.getWriter().write(
                    "{\"message\":\"Demasiadas solicitudes. "
                    + "Intente nuevamente en unos segundos.\"}"
            );
            return;
        }

        filterChain.doFilter(
                request,
                response
        );
    }

    private Decision register(
            String bucketKey,
            LimitRule rule,
            long now
    ) {
        DecisionHolder holder =
                new DecisionHolder();

        windows.compute(
                bucketKey,
                (ignored, current) -> {
                    if (
                            current == null
                            || now
                            - current.windowStartedAt()
                            >= rule.windowSeconds()
                    ) {
                        holder.value =
                                new Decision(
                                        true,
                                        0L
                                );

                        return new WindowState(
                                now,
                                1
                        );
                    }

                    int nextCount =
                            current.count()
                            + 1;

                    long retryAfter =
                            Math.max(
                                    1L,
                                    rule.windowSeconds()
                                    - (
                                            now
                                            - current.windowStartedAt()
                                    )
                            );

                    holder.value =
                            new Decision(
                                    nextCount
                                    <= rule.maxRequests(),
                                    retryAfter
                            );

                    return new WindowState(
                            current.windowStartedAt(),
                            nextCount
                    );
                }
        );

        return holder.value;
    }

    private void cleanupIfNeeded(
            long now
    ) {
        if (
                requestCounter.incrementAndGet()
                % CLEANUP_INTERVAL
                != 0L
        ) {
            return;
        }

        long maxWindow =
                Math.max(
                        authWindowSeconds,
                        expensiveWindowSeconds
                );

        long cutoff =
                now
                - (
                    maxWindow
                    * 2L
                );

        windows.entrySet().removeIf(
                entry ->
                        entry
                        .getValue()
                        .windowStartedAt()
                        < cutoff
        );
    }

    private String clientKey(
            HttpServletRequest request
    ) {
        if (trustProxyHeaders) {
            String forwardedFor =
                    request.getHeader(
                            "X-Forwarded-For"
                    );

            if (
                    forwardedFor != null
                    && !forwardedFor.isBlank()
            ) {
                int comma =
                        forwardedFor.indexOf(',');

                String first =
                        (
                                comma >= 0
                                ? forwardedFor.substring(
                                        0,
                                        comma
                                )
                                : forwardedFor
                        ).trim();

                if (!first.isBlank()) {
                    return first;
                }
            }
        }

        String remote =
                request.getRemoteAddr();

        return (
                remote == null
                || remote.isBlank()
        )
                ? "unknown"
                : remote;
    }

    private LimitRule resolveRule(
            String requestUri
    ) {
        if (
                "/api/auth/login".equals(
                        requestUri
                )
                || "/api/auth/register".equals(
                        requestUri
                )
        ) {
            return new LimitRule(
                    AUTH_GROUP,
                    authMaxRequests,
                    authWindowSeconds
            );
        }

        if (
                requestUri.startsWith(
                        "/api/customer/try-on"
                )
                || requestUri.endsWith(
                        "/ai-query"
                )
                || requestUri.endsWith(
                        "/ai-narrative"
                )
        ) {
            return new LimitRule(
                    EXPENSIVE_GROUP,
                    expensiveMaxRequests,
                    expensiveWindowSeconds
            );
        }

        return null;
    }

    private static int positive(
            int value,
            String name
    ) {
        if (value <= 0) {
            throw new IllegalArgumentException(
                    "velora.security.rate-limit."
                    + name
                    + " debe ser mayor a cero."
            );
        }

        return value;
    }

    private static long positive(
            long value,
            String name
    ) {
        if (value <= 0L) {
            throw new IllegalArgumentException(
                    "velora.security.rate-limit."
                    + name
                    + " debe ser mayor a cero."
            );
        }

        return value;
    }

    private record LimitRule(
            String group,
            int maxRequests,
            long windowSeconds
    ) {
    }

    private record WindowState(
            long windowStartedAt,
            int count
    ) {
    }

    private record Decision(
            boolean allowed,
            long retryAfterSeconds
    ) {
    }

    private static final class DecisionHolder {
        private Decision value;
    }
}
