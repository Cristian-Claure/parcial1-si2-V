package com.velora.report.ai;

import java.net.http.HttpClient;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.velora.report.OperationalReportService;
import com.velora.report.ReportOverviewResponse;
import com.velora.report.ReportPeriodBoundsResponse;
import com.velora.store.StoreEntity;
import com.velora.store.StoreRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OperationalAiReportService {

    private static final ZoneId REPORT_ZONE =
            ZoneId.of("America/La_Paz");

    private static final Pattern LAST_DAYS_PATTERN =
            Pattern.compile(
                    "\\bultim(?:o|os|a|as)\\s+(\\d{1,3})\\s+dias\\b"
            );

    private static final Pattern MONTH_YEAR_PATTERN =
            Pattern.compile(
                    "\\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+(?:de\\s+)?(20\\d{2})\\b"
            );

    private static final Map<String, Integer> SPANISH_MONTHS =
            Map.ofEntries(
                    Map.entry("enero", 1),
                    Map.entry("febrero", 2),
                    Map.entry("marzo", 3),
                    Map.entry("abril", 4),
                    Map.entry("mayo", 5),
                    Map.entry("junio", 6),
                    Map.entry("julio", 7),
                    Map.entry("agosto", 8),
                    Map.entry("septiembre", 9),
                    Map.entry("octubre", 10),
                    Map.entry("noviembre", 11),
                    Map.entry("diciembre", 12)
            );

    private static final Set<String> ALLOWED_FOCUS =
            Set.of(
                    "OVERVIEW",
                    "SALES",
                    "ORDERS",
                    "PAYMENTS",
                    "INVENTORY",
                    "PRODUCTS"
            );

    private static final Set<String> ALLOWED_CHARTS =
            Set.of(
                    "AUTO",
                    "LINE",
                    "BAR",
                    "DONUT",
                    "TABLE"
            );

    private final RestClient aiClient;
    private final String internalToken;
    private final OperationalReportService reports;
    private final StoreRepository stores;
    private final UserRepository users;

    public OperationalAiReportService(
            @Value("${velora.ai.base-url}") String baseUrl,
            @Value("${velora.ai.internal-token:}") String internalToken,
            OperationalReportService reports,
            StoreRepository stores,
            UserRepository users
    ) {
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .version(
                                HttpClient.Version.HTTP_1_1
                        )
                        .build();

        this.aiClient =
                RestClient.builder()
                        .requestFactory(
                                new JdkClientHttpRequestFactory(
                                        httpClient
                                )
                        )
                        .baseUrl(baseUrl)
                        .build();

        this.internalToken =
                internalToken == null
                        ? ""
                        : internalToken.trim();

        this.reports = reports;
        this.stores = stores;
        this.users = users;
    }

    public ReportAiQueryResponse query(
            UUID actorId,
            ReportAiQueryRequest request
    ) {
        ActorScope scope =
                resolveActorScope(actorId);

        ensureAiConfigured();

        String question =
                request.question().trim();

        List<StoreOption> availableStores =
                availableStores(scope);

        InterpretResponse interpreted =
                callInterpret(
                        question,
                        availableStores
                );

        SafeIntent safeIntent =
                validateIntent(
                        interpreted.intent(),
                        availableStores
                );

        safeIntent =
                applyDeterministicPeriod(
                        question,
                        safeIntent
                );

        UUID effectiveStoreId =
                effectiveStoreId(
                        scope,
                        safeIntent.storeId()
                );

        ReportPeriodBoundsResponse bounds =
                reports.periodBounds(
                        actorId,
                        effectiveStoreId
                );

        LocalDate effectiveFrom =
                safeIntent.fromDate();

        LocalDate effectiveTo =
                safeIntent.toDate();

        if (usesSelectedRange(question)) {
            if (effectiveFrom == null) {
                effectiveFrom =
                        request.fromDate();
            }

            if (effectiveTo == null) {
                effectiveTo =
                        request.toDate();
            }
        }

        if (effectiveFrom == null) {
            effectiveFrom =
                    bounds.minDate();
        }

        if (effectiveTo == null) {
            effectiveTo =
                    bounds.maxDate();
        }

        ReportOverviewResponse report =
                reports.overview(
                        actorId,
                        effectiveFrom,
                        effectiveTo,
                        effectiveStoreId
                );

        ReportAiNarrativeResponse narrative =
                toNarrativeResponse(
                        callNarrative(
                                question,
                                report
                        )
                );

        return new ReportAiQueryResponse(
                question,
                new ReportAiQueryResponse.Intent(
                        safeIntent.focus(),
                        report.from(),
                        report.to(),
                        effectiveStoreId,
                        safeIntent.requestedChart()
                ),
                report,
                narrative,
                interpreted.model()
        );
    }

    public ReportAiNarrativeResponse narrative(
            UUID actorId,
            ReportAiNarrativeRequest request
    ) {
        ActorScope scope =
                resolveActorScope(actorId);

        ensureAiConfigured();

        UUID effectiveStoreId =
                effectiveStoreId(
                        scope,
                        request.storeId()
                );

        ReportOverviewResponse report =
                reports.overview(
                        actorId,
                        request.fromDate(),
                        request.toDate(),
                        effectiveStoreId
                );

        return toNarrativeResponse(
                callNarrative(
                        request.question().trim(),
                        report
                )
        );
    }

    private ReportAiNarrativeResponse toNarrativeResponse(
            NarrativeResponse narrative
    ) {
        List<String> insights =
                narrative.insights() == null
                        ? List.of()
                        : narrative.insights()
                                .stream()
                                .filter(
                                        value ->
                                                value != null
                                                        && !value.isBlank()
                                )
                                .map(String::trim)
                                .limit(6)
                                .toList();

        List<String> recommendations =
                narrative.recommendations() == null
                        ? List.of()
                        : narrative.recommendations()
                                .stream()
                                .filter(
                                        value ->
                                                value != null
                                                        && !value.isBlank()
                                )
                                .map(String::trim)
                                .limit(4)
                                .toList();

        return new ReportAiNarrativeResponse(
                narrative.summary() == null
                        ? ""
                        : narrative.summary().trim(),
                insights,
                narrative.assessment() == null
                        ? ""
                        : narrative.assessment().trim(),
                recommendations,
                narrative.model()
        );
    }

    private SafeIntent applyDeterministicPeriod(
            String question,
            SafeIntent intent
    ) {
        LocalDate currentDate =
                LocalDate.now(
                        REPORT_ZONE
                );

        PeriodHint relativeHint =
                resolveQuestionPeriod(
                        question,
                        currentDate
                );

        if (relativeHint != null) {
            return new SafeIntent(
                    intent.focus(),
                    relativeHint.fromDate(),
                    relativeHint.toDate(),
                    intent.storeId(),
                    intent.requestedChart()
            );
        }

        if (
                intent.fromDate() != null
                        || intent.toDate() != null
        ) {
            return intent;
        }

        PeriodHint calendarHint =
                resolveSingleMonthYear(
                        question
                );

        if (calendarHint == null) {
            return intent;
        }

        return new SafeIntent(
                intent.focus(),
                calendarHint.fromDate(),
                calendarHint.toDate(),
                intent.storeId(),
                intent.requestedChart()
        );
    }

    private boolean usesSelectedRange(
            String question
    ) {
        String normalized =
                normalizeQuestion(
                        question
                );

        return normalized.contains(
                "periodo seleccionado"
        )
                || normalized.contains(
                        "rango seleccionado"
                )
                || normalized.contains(
                        "fechas seleccionadas"
                )
                || normalized.contains(
                        "estas fechas"
                );
    }

    private PeriodHint resolveQuestionPeriod(
            String question,
            LocalDate currentDate
    ) {
        String normalized =
                normalizeQuestion(question);

        if (normalized.contains("semana pasada")) {
            LocalDate currentMonday =
                    currentDate.minusDays(
                            currentDate
                                    .getDayOfWeek()
                                    .getValue() - 1L
                    );

            LocalDate from =
                    currentMonday.minusWeeks(1);

            return new PeriodHint(
                    from,
                    from.plusDays(6)
            );
        }

        if (
                normalized.contains("ultima semana")
                        || normalized.contains("ultimos siete dias")
        ) {
            return new PeriodHint(
                    currentDate.minusDays(6),
                    currentDate
            );
        }

        if (normalized.contains("esta semana")) {
            LocalDate from =
                    currentDate.minusDays(
                            currentDate
                                    .getDayOfWeek()
                                    .getValue() - 1L
                    );

            return new PeriodHint(
                    from,
                    currentDate
            );
        }

        Matcher lastDays =
                LAST_DAYS_PATTERN.matcher(
                        normalized
                );

        if (lastDays.find()) {
            int days =
                    Integer.parseInt(
                            lastDays.group(1)
                    );

            if (days >= 1 && days <= 730) {
                return new PeriodHint(
                        currentDate.minusDays(
                                days - 1L
                        ),
                        currentDate
                );
            }
        }

        if (normalized.contains("ayer")) {
            LocalDate yesterday =
                    currentDate.minusDays(1);

            return new PeriodHint(
                    yesterday,
                    yesterday
            );
        }

        if (
                normalized.equals("hoy")
                        || normalized.contains(" hoy ")
                        || normalized.startsWith("hoy ")
                        || normalized.endsWith(" hoy")
        ) {
            return new PeriodHint(
                    currentDate,
                    currentDate
            );
        }

        if (
                normalized.contains("mes pasado")
                        || normalized.contains("mes anterior")
        ) {
            YearMonth previous =
                    YearMonth.from(
                            currentDate
                    ).minusMonths(1);

            return new PeriodHint(
                    previous.atDay(1),
                    previous.atEndOfMonth()
            );
        }

        if (
                normalized.contains("este mes")
                        || normalized.contains("mes actual")
        ) {
            return new PeriodHint(
                    currentDate.withDayOfMonth(1),
                    currentDate
            );
        }

        return null;
    }

    private PeriodHint resolveSingleMonthYear(
            String question
    ) {
        String normalized =
                normalizeQuestion(
                        question
                );

        Matcher monthYear =
                MONTH_YEAR_PATTERN.matcher(
                        normalized
                );

        if (!monthYear.find()) {
            return null;
        }

        String monthName =
                monthYear.group(1);

        String yearValue =
                monthYear.group(2);

        if (monthYear.find()) {
            return null;
        }

        Integer month =
                SPANISH_MONTHS.get(
                        monthName
                );

        if (month == null) {
            return null;
        }

        YearMonth target =
                YearMonth.of(
                        Integer.parseInt(
                                yearValue
                        ),
                        month
                );

        return new PeriodHint(
                target.atDay(1),
                target.atEndOfMonth()
        );
    }

    private String normalizeQuestion(
            String value
    ) {
        String normalized =
                Normalizer.normalize(
                        value == null ? "" : value,
                        Normalizer.Form.NFD
                )
                .replaceAll(
                        "\\p{M}+",
                        ""
                )
                .toLowerCase(
                        Locale.ROOT
                )
                .replaceAll(
                        "[^a-z0-9\\s]",
                        " "
                )
                .replaceAll(
                        "\\s+",
                        " "
                )
                .trim();

        return normalized;
    }

    private InterpretResponse callInterpret(
            String question,
            List<StoreOption> availableStores
    ) {
        Map<String, Object> payload =
                Map.of(
                        "question",
                        question,
                        "currentDate",
                        LocalDate.now(
                                REPORT_ZONE
                        ).toString(),
                        "availableStores",
                        availableStores
                );

        try {
            InterpretResponse response =
                    aiClient
                            .post()
                            .uri("/reports/interpret")
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .contentType(
                                    MediaType.APPLICATION_JSON
                            )
                            .body(payload)
                            .retrieve()
                            .body(
                                    InterpretResponse.class
                            );

            if (
                    response == null
                            || response.intent() == null
            ) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "VÉLORA AI devolvió una intención de reporte vacía."
                );
            }

            return response;
        }
        catch (RestClientResponseException ex) {
            throw mapAiResponseError(
                    ex,
                    "VÉLORA AI no pudo interpretar la consulta del reporte."
            );
        }
        catch (ResourceAccessException ex) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "El servicio VÉLORA AI no está iniciado.",
                    ex
            );
        }
    }

    private NarrativeResponse callNarrative(
            String question,
            ReportOverviewResponse report
    ) {
        Map<String, Object> payload =
                Map.of(
                        "question",
                        question,
                        "report",
                        report
                );

        try {
            NarrativeResponse response =
                    aiClient
                            .post()
                            .uri("/reports/narrate")
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .contentType(
                                    MediaType.APPLICATION_JSON
                            )
                            .body(payload)
                            .retrieve()
                            .body(
                                    NarrativeResponse.class
                            );

            if (response == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "VÉLORA AI devolvió una narrativa vacía."
                );
            }

            return response;
        }
        catch (RestClientResponseException ex) {
            throw mapAiResponseError(
                    ex,
                    "VÉLORA AI no pudo analizar el reporte."
            );
        }
        catch (ResourceAccessException ex) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "El servicio VÉLORA AI no está iniciado.",
                    ex
            );
        }
    }

    private SafeIntent validateIntent(
            FastApiIntent intent,
            List<StoreOption> availableStores
    ) {
        String focus =
                normalizeUpper(
                        intent.focus(),
                        "OVERVIEW"
                );

        if (!ALLOWED_FOCUS.contains(focus)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un enfoque de reporte no permitido."
            );
        }

        String chart =
                normalizeUpper(
                        intent.requestedChart(),
                        "AUTO"
                );

        if (!ALLOWED_CHARTS.contains(chart)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un tipo de gráfica no permitido."
            );
        }

        UUID storeId =
                parseStoreId(
                        intent.storeId()
                );

        if (storeId != null) {
            boolean allowed =
                    availableStores
                            .stream()
                            .anyMatch(
                                    store ->
                                            store.id().equals(
                                                    storeId.toString()
                                            )
                            );

            if (!allowed) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "VÉLORA AI devolvió una sucursal fuera del alcance permitido."
                );
            }
        }

        if (
                intent.fromDate() != null
                        && intent.toDate() != null
                        && intent.fromDate()
                                .isAfter(
                                        intent.toDate()
                                )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un período inválido."
            );
        }

        return new SafeIntent(
                focus,
                intent.fromDate(),
                intent.toDate(),
                storeId,
                chart
        );
    }

    private UUID effectiveStoreId(
            ActorScope scope,
            UUID requestedStoreId
    ) {
        if (
                scope.role() ==
                        UserRole.STORE_MANAGER
        ) {
            if (
                    requestedStoreId != null
                            && !scope.storeId()
                                    .equals(
                                            requestedStoreId
                                    )
            ) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "No puede consultar reportes de otra sucursal."
                );
            }

            return scope.storeId();
        }

        if (requestedStoreId == null) {
            return null;
        }

        StoreEntity store =
                stores.findById(
                        requestedStoreId
                )
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "Sucursal no encontrada."
                                )
                );

        if (!store.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La sucursal seleccionada está inactiva."
            );
        }

        return store.getId();
    }

    private List<StoreOption> availableStores(
            ActorScope scope
    ) {
        if (
                scope.role() ==
                        UserRole.STORE_MANAGER
        ) {
            return List.of(
                    new StoreOption(
                            scope.storeId().toString(),
                            scope.storeName()
                    )
            );
        }

        List<StoreOption> result =
                new ArrayList<>();

        stores.findAll()
                .stream()
                .filter(StoreEntity::isActive)
                .sorted(
                        java.util.Comparator.comparing(
                                StoreEntity::getName,
                                String.CASE_INSENSITIVE_ORDER
                        )
                )
                .forEach(
                        store ->
                                result.add(
                                        new StoreOption(
                                                store.getId().toString(),
                                                store.getName()
                                        )
                                )
                );

        return List.copyOf(result);
    }

    private ActorScope resolveActorScope(
            UUID actorId
    ) {
        UserEntity actor =
                users.findById(actorId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.UNAUTHORIZED,
                                                "Usuario autenticado no encontrado."
                                        )
                        );

        if (actor.getStatus() != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        if (actor.getRole() == UserRole.ADMIN) {
            return new ActorScope(
                    UserRole.ADMIN,
                    null,
                    "Todas las sucursales"
            );
        }

        if (
                actor.getRole() ==
                        UserRole.STORE_MANAGER
        ) {
            if (actor.getStore() == null) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "El encargado no tiene una sucursal asignada."
                );
            }

            return new ActorScope(
                    UserRole.STORE_MANAGER,
                    actor.getStore().getId(),
                    actor.getStore().getName()
            );
        }

        throw new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "No tiene permisos para consultar reportes con IA."
        );
    }

    private ResponseStatusException mapAiResponseError(
            RestClientResponseException ex,
            String fallback
    ) {
        if (ex.getStatusCode().value() == 503) {
            return new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "VÉLORA AI no está configurado o no está disponible.",
                    ex
            );
        }

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                fallback,
                ex
        );
    }

    private void ensureAiConfigured() {
        if (internalToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "VÉLORA AI no está configurado en el backend."
            );
        }
    }

    private UUID parseStoreId(
            String value
    ) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return UUID.fromString(
                    value.trim()
            );
        }
        catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un identificador de sucursal inválido.",
                    ex
            );
        }
    }

    private String normalizeUpper(
            String value,
            String fallback
    ) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        return value.trim()
                .toUpperCase(
                        java.util.Locale.ROOT
                );
    }

    private record ActorScope(
            UserRole role,
            UUID storeId,
            String storeName
    ) {}

    private record StoreOption(
            String id,
            String name
    ) {}

    private record InterpretResponse(
            FastApiIntent intent,
            String model
    ) {}

    private record FastApiIntent(
            String focus,
            LocalDate fromDate,
            LocalDate toDate,
            String storeId,
            String requestedChart
    ) {}

    private record SafeIntent(
            String focus,
            LocalDate fromDate,
            LocalDate toDate,
            UUID storeId,
            String requestedChart
    ) {}

    private record PeriodHint(
            LocalDate fromDate,
            LocalDate toDate
    ) {}

    private record NarrativeResponse(
            String summary,
            List<String> insights,
            String assessment,
            List<String> recommendations,
            String model
    ) {}
}