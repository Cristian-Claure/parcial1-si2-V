package com.velora.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.velora.inventory.InventoryStockEntity;
import com.velora.inventory.InventoryStockRepository;
import com.velora.order.OrderChannel;
import com.velora.order.OrderEntity;
import com.velora.order.OrderItemEntity;
import com.velora.order.OrderItemRepository;
import com.velora.order.OrderRepository;
import com.velora.payment.PaymentEntity;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentRepository;
import com.velora.payment.PaymentStatus;
import com.velora.store.StoreEntity;
import com.velora.store.StoreRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OperationalReportService {

    private static final ZoneId REPORT_ZONE =
            ZoneId.of("America/La_Paz");

    private static final DateTimeFormatter DAY_LABEL =
            DateTimeFormatter.ofPattern("dd/MM");

    private final OrderRepository orders;
    private final OrderItemRepository orderItems;
    private final PaymentRepository payments;
    private final InventoryStockRepository stocks;
    private final StoreRepository stores;
    private final UserRepository users;

    public OperationalReportService(
            OrderRepository orders,
            OrderItemRepository orderItems,
            PaymentRepository payments,
            InventoryStockRepository stocks,
            StoreRepository stores,
            UserRepository users
    ) {
        this.orders = orders;
        this.orderItems = orderItems;
        this.payments = payments;
        this.stocks = stocks;
        this.stores = stores;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public ReportOverviewResponse overview(
            UUID actorId,
            LocalDate requestedFrom,
            LocalDate requestedTo,
            UUID requestedStoreId
    ) {
        Scope scope =
                resolveScope(
                        actorId,
                        requestedStoreId
                );

        Period period =
                resolvePeriod(
                        requestedFrom,
                        requestedTo
                );

        List<OrderEntity> scopedOrders =
                orders.findAll()
                        .stream()
                        .filter(
                                order ->
                                        matchesScope(
                                                scope,
                                                order
                                                        .getWarehouse()
                                                        .getStore()
                                                        .getId()
                                        )
                        )
                        .toList();

        List<PaymentEntity> scopedPayments =
                payments.findAll()
                        .stream()
                        .filter(
                                payment ->
                                        matchesScope(
                                                scope,
                                                payment
                                                        .getOrder()
                                                        .getWarehouse()
                                                        .getStore()
                                                        .getId()
                                        )
                        )
                        .toList();

        List<PaymentEntity> paidEvents =
                scopedPayments
                        .stream()
                        .filter(
                                payment ->
                                        payment.getPaidAt() != null
                                                && inPeriod(
                                                        payment.getPaidAt(),
                                                        period
                                                )
                                                && (
                                                        payment.getStatus()
                                                                == PaymentStatus.PAID
                                                        || payment.getStatus()
                                                                == PaymentStatus.REFUNDED
                                                )
                        )
                        .toList();

        List<PaymentEntity> refundEvents =
                scopedPayments
                        .stream()
                        .filter(
                                payment ->
                                        payment.getStatus()
                                                == PaymentStatus.REFUNDED
                                                && payment.getRefundedAt()
                                                        != null
                                                && inPeriod(
                                                        payment.getRefundedAt(),
                                                        period
                                                )
                        )
                        .toList();

        BigDecimal grossSales =
                sumPayments(paidEvents);

        BigDecimal refunds =
                sumPayments(refundEvents);

        BigDecimal netSales =
                grossSales.subtract(refunds);

        Set<UUID> paidOrderIds =
                new LinkedHashSet<>();

        for (PaymentEntity payment : paidEvents) {
            paidOrderIds.add(
                    payment.getOrder().getId()
            );
        }

        long fulfilledOrders =
                scopedOrders
                        .stream()
                        .filter(
                                order ->
                                        order.getFulfilledAt() != null
                                                && inPeriod(
                                                        order.getFulfilledAt(),
                                                        period
                                                )
                        )
                        .count();

        long createdOrders =
                scopedOrders
                        .stream()
                        .filter(
                                order ->
                                        inPeriod(
                                                order.getCreatedAt(),
                                                period
                                        )
                        )
                        .count();

        long cancelledOrders =
                scopedOrders
                        .stream()
                        .filter(
                                order ->
                                        order.getCancelledAt() != null
                                                && inPeriod(
                                                        order.getCancelledAt(),
                                                        period
                                                )
                        )
                        .count();

        BigDecimal averageTicket =
                paidOrderIds.isEmpty()
                        ? BigDecimal.ZERO
                        : grossSales.divide(
                                BigDecimal.valueOf(
                                        paidOrderIds.size()
                                ),
                                2,
                                RoundingMode.HALF_UP
                        );

        List<InventoryStockEntity> scopedStocks =
                stocks.findAll()
                        .stream()
                        .filter(
                                stock ->
                                        matchesScope(
                                                scope,
                                                stock
                                                        .getWarehouse()
                                                        .getStore()
                                                        .getId()
                                        )
                        )
                        .toList();

        long availableUnits =
                scopedStocks
                        .stream()
                        .mapToLong(
                                InventoryStockEntity::getAvailableQuantity
                        )
                        .sum();

        long lowStockVariants =
                scopedStocks
                        .stream()
                        .filter(
                                stock ->
                                        stock.getAvailableQuantity() <= 3
                        )
                        .count();

        List<ReportKpi> kpis =
                List.of(
                        new ReportKpi(
                                "NET_SALES",
                                "Venta neta",
                                money(netSales),
                                "CURRENCY",
                                "Cobros confirmados menos reembolsos del período."
                        ),
                        new ReportKpi(
                                "GROSS_SALES",
                                "Venta bruta",
                                money(grossSales),
                                "CURRENCY",
                                "Cobros confirmados durante el período."
                        ),
                        new ReportKpi(
                                "PAID_ORDERS",
                                "Pedidos pagados",
                                BigDecimal.valueOf(
                                        paidOrderIds.size()
                                ),
                                "COUNT",
                                "Pedidos con al menos un pago confirmado."
                        ),
                        new ReportKpi(
                                "AVERAGE_TICKET",
                                "Ticket promedio",
                                money(averageTicket),
                                "CURRENCY",
                                "Venta bruta dividida entre pedidos pagados."
                        ),
                        new ReportKpi(
                                "FULFILLED_ORDERS",
                                "Pedidos completados",
                                BigDecimal.valueOf(
                                        fulfilledOrders
                                ),
                                "COUNT",
                                "Pedidos entregados o completados en el período."
                        ),
                        new ReportKpi(
                                "REFUNDS",
                                "Reembolsos",
                                money(refunds),
                                "CURRENCY",
                                "Importe reembolsado durante el período."
                        ),
                        new ReportKpi(
                                "AVAILABLE_UNITS",
                                "Stock disponible",
                                BigDecimal.valueOf(
                                        availableUnits
                                ),
                                "COUNT",
                                "Unidades disponibles actualmente en el alcance."
                        ),
                        new ReportKpi(
                                "LOW_STOCK_VARIANTS",
                                "Variantes críticas",
                                BigDecimal.valueOf(
                                        lowStockVariants
                                ),
                                "COUNT",
                                "Variantes con 3 unidades disponibles o menos."
                        )
                );

        List<ReportChart> charts =
                List.of(
                        salesTrend(
                                paidEvents,
                                refundEvents,
                                period
                        ),
                        salesByStore(
                                paidEvents,
                                refundEvents
                        ),
                        ordersByChannel(
                                scopedOrders,
                                period
                        ),
                        paymentsByMethod(
                                paidEvents
                        ),
                        inventoryByStore(
                                scopedStocks
                        )
                );

        ProductRanking ranking =
                topProducts(
                        paidEvents,
                        period
                );

        List<String> insights =
                buildDeterministicInsights(
                        netSales,
                        refunds,
                        createdOrders,
                        cancelledOrders,
                        lowStockVariants,
                        ranking
                );

        return new ReportOverviewResponse(
                "Resumen comercial VÉLORA",
                scope.label(),
                period.from(),
                period.to(),
                Instant.now(),
                kpis,
                charts,
                List.of(ranking.table()),
                insights
        );
    }

    @Transactional(readOnly = true)
    public ReportPeriodBoundsResponse periodBounds(
            UUID actorId,
            UUID requestedStoreId
    ) {
        Scope scope =
                resolveScope(
                        actorId,
                        requestedStoreId
                );

        LocalDate today =
                LocalDate.now(
                        REPORT_ZONE
                );

        LocalDate minDate =
                orders.findAll()
                        .stream()
                        .filter(
                                order ->
                                        matchesScope(
                                                scope,
                                                order
                                                        .getWarehouse()
                                                        .getStore()
                                                        .getId()
                                        )
                        )
                        .map(OrderEntity::getCreatedAt)
                        .filter(
                                value ->
                                        value != null
                        )
                        .map(this::localDate)
                        .min(LocalDate::compareTo)
                        .orElse(
                                today.minusDays(29)
                        );

        return new ReportPeriodBoundsResponse(
                minDate,
                today
        );
    }

    private Scope resolveScope(
            UUID actorId,
            UUID requestedStoreId
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

        if (actor.getRole() == UserRole.STORE_MANAGER) {
            if (actor.getStore() == null) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "El encargado no tiene una sucursal asignada."
                );
            }

            UUID assignedStoreId =
                    actor.getStore().getId();

            if (
                    requestedStoreId != null
                            && !assignedStoreId.equals(
                                    requestedStoreId
                            )
            ) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "No puede consultar reportes de otra sucursal."
                );
            }

            return new Scope(
                    assignedStoreId,
                    actor.getStore().getName()
            );
        }

        if (actor.getRole() != UserRole.ADMIN) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para consultar reportes operativos."
            );
        }

        if (requestedStoreId == null) {
            return new Scope(
                    null,
                    "Todas las sucursales"
            );
        }

        StoreEntity store =
                stores.findById(requestedStoreId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Sucursal no encontrada."
                                        )
                        );

        return new Scope(
                store.getId(),
                store.getName()
        );
    }

    private Period resolvePeriod(
            LocalDate requestedFrom,
            LocalDate requestedTo
    ) {
        LocalDate today =
                LocalDate.now(REPORT_ZONE);

        LocalDate to =
                requestedTo == null
                        ? today
                        : requestedTo;

        LocalDate from =
                requestedFrom == null
                        ? to.minusDays(29)
                        : requestedFrom;

        if (from.isAfter(to)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La fecha inicial no puede ser posterior a la fecha final."
            );
        }

        Instant start =
                from.atStartOfDay(
                        REPORT_ZONE
                ).toInstant();

        Instant endExclusive =
                to.plusDays(1)
                        .atStartOfDay(
                                REPORT_ZONE
                        )
                        .toInstant();

        return new Period(
                from,
                to,
                start,
                endExclusive
        );
    }

    private ReportChart salesTrend(
            List<PaymentEntity> paidEvents,
            List<PaymentEntity> refundEvents,
            Period period
    ) {
        long days =
                ChronoUnit.DAYS.between(
                        period.from(),
                        period.to()
                ) + 1;

        if (days <= 45) {
            return salesByDay(
                    paidEvents,
                    refundEvents,
                    period
            );
        }

        if (days <= 180) {
            return salesByWeek(
                    paidEvents,
                    refundEvents,
                    period
            );
        }

        return salesByMonth(
                paidEvents,
                refundEvents,
                period
        );
    }

    private ReportChart salesByWeek(
            List<PaymentEntity> paidEvents,
            List<PaymentEntity> refundEvents,
            Period period
    ) {
        Map<LocalDate, BigDecimal> gross =
                new LinkedHashMap<>();

        Map<LocalDate, BigDecimal> refunded =
                new LinkedHashMap<>();

        LocalDate cursor =
                period.from();

        while (!cursor.isAfter(period.to())) {
            gross.put(
                    cursor,
                    BigDecimal.ZERO
            );

            refunded.put(
                    cursor,
                    BigDecimal.ZERO
            );

            cursor =
                    cursor.plusDays(7);
        }

        for (PaymentEntity payment : paidEvents) {
            LocalDate day =
                    localDate(
                            payment.getPaidAt()
                    );

            long offset =
                    ChronoUnit.DAYS.between(
                            period.from(),
                            day
                    );

            LocalDate bucket =
                    period.from()
                            .plusDays(
                                    (offset / 7) * 7
                            );

            gross.computeIfPresent(
                    bucket,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        for (PaymentEntity payment : refundEvents) {
            LocalDate day =
                    localDate(
                            payment.getRefundedAt()
                    );

            long offset =
                    ChronoUnit.DAYS.between(
                            period.from(),
                            day
                    );

            LocalDate bucket =
                    period.from()
                            .plusDays(
                                    (offset / 7) * 7
                            );

            refunded.computeIfPresent(
                    bucket,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        List<String> categories =
                gross.keySet()
                        .stream()
                        .map(
                                start -> {
                                    LocalDate end =
                                            start.plusDays(6);

                                    if (end.isAfter(period.to())) {
                                        end = period.to();
                                    }

                                    return DAY_LABEL.format(start)
                                            + "–"
                                            + DAY_LABEL.format(end);
                                }
                        )
                        .toList();

        return salesTrendChart(
                "Ventas por semana",
                categories,
                gross,
                refunded
        );
    }

    private ReportChart salesByMonth(
            List<PaymentEntity> paidEvents,
            List<PaymentEntity> refundEvents,
            Period period
    ) {
        Map<LocalDate, BigDecimal> gross =
                new LinkedHashMap<>();

        Map<LocalDate, BigDecimal> refunded =
                new LinkedHashMap<>();

        LocalDate cursor =
                period.from()
                        .withDayOfMonth(1);

        LocalDate last =
                period.to()
                        .withDayOfMonth(1);

        while (!cursor.isAfter(last)) {
            gross.put(
                    cursor,
                    BigDecimal.ZERO
            );

            refunded.put(
                    cursor,
                    BigDecimal.ZERO
            );

            cursor =
                    cursor.plusMonths(1);
        }

        for (PaymentEntity payment : paidEvents) {
            LocalDate bucket =
                    localDate(
                            payment.getPaidAt()
                    ).withDayOfMonth(1);

            gross.computeIfPresent(
                    bucket,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        for (PaymentEntity payment : refundEvents) {
            LocalDate bucket =
                    localDate(
                            payment.getRefundedAt()
                    ).withDayOfMonth(1);

            refunded.computeIfPresent(
                    bucket,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        DateTimeFormatter monthLabel =
                DateTimeFormatter.ofPattern(
                        "MM/yyyy"
                );

        List<String> categories =
                gross.keySet()
                        .stream()
                        .map(monthLabel::format)
                        .toList();

        return salesTrendChart(
                "Ventas por mes",
                categories,
                gross,
                refunded
        );
    }

    private ReportChart salesTrendChart(
            String title,
            List<String> categories,
            Map<LocalDate, BigDecimal> gross,
            Map<LocalDate, BigDecimal> refunded
    ) {
        List<BigDecimal> grossData =
                gross.values()
                        .stream()
                        .map(this::money)
                        .toList();

        List<BigDecimal> refundData =
                refunded.values()
                        .stream()
                        .map(this::money)
                        .toList();

        List<BigDecimal> netData =
                new ArrayList<>();

        for (LocalDate key : gross.keySet()) {
            netData.add(
                    money(
                            gross.get(key)
                                    .subtract(
                                            refunded.get(key)
                                    )
                    )
            );
        }

        return new ReportChart(
                "sales-daily",
                title,
                "LINE",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Venta bruta",
                                grossData
                        ),
                        new ReportChart.Series(
                                "Reembolsos",
                                refundData
                        ),
                        new ReportChart.Series(
                                "Venta neta",
                                netData
                        )
                )
        );
    }

    private ReportChart salesByDay(
            List<PaymentEntity> paidEvents,
            List<PaymentEntity> refundEvents,
            Period period
    ) {
        Map<LocalDate, BigDecimal> gross =
                new LinkedHashMap<>();

        Map<LocalDate, BigDecimal> refunded =
                new LinkedHashMap<>();

        LocalDate cursor =
                period.from();

        while (!cursor.isAfter(period.to())) {
            gross.put(
                    cursor,
                    BigDecimal.ZERO
            );

            refunded.put(
                    cursor,
                    BigDecimal.ZERO
            );

            cursor =
                    cursor.plusDays(1);
        }

        for (PaymentEntity payment : paidEvents) {
            LocalDate day =
                    localDate(
                            payment.getPaidAt()
                    );

            gross.computeIfPresent(
                    day,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        for (PaymentEntity payment : refundEvents) {
            LocalDate day =
                    localDate(
                            payment.getRefundedAt()
                    );

            refunded.computeIfPresent(
                    day,
                    (key, value) ->
                            value.add(
                                    payment.getAmount()
                            )
            );
        }

        List<String> categories =
                gross.keySet()
                        .stream()
                        .map(
                                DAY_LABEL::format
                        )
                        .toList();

        List<BigDecimal> grossData =
                gross.values()
                        .stream()
                        .map(this::money)
                        .toList();

        List<BigDecimal> refundData =
                refunded.values()
                        .stream()
                        .map(this::money)
                        .toList();

        List<BigDecimal> netData =
                new ArrayList<>();

        for (LocalDate day : gross.keySet()) {
            netData.add(
                    money(
                            gross.get(day)
                                    .subtract(
                                            refunded.get(day)
                                    )
                    )
            );
        }

        return new ReportChart(
                "sales-daily",
                "Ventas por día",
                "LINE",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Venta bruta",
                                grossData
                        ),
                        new ReportChart.Series(
                                "Reembolsos",
                                refundData
                        ),
                        new ReportChart.Series(
                                "Venta neta",
                                netData
                        )
                )
        );
    }

    private ReportChart salesByStore(
            List<PaymentEntity> paidEvents,
            List<PaymentEntity> refundEvents
    ) {
        Map<String, BigDecimal> gross =
                new HashMap<>();

        Map<String, BigDecimal> refunded =
                new HashMap<>();

        for (PaymentEntity payment : paidEvents) {
            String store =
                    payment.getOrder()
                            .getWarehouse()
                            .getStore()
                            .getName();

            gross.merge(
                    store,
                    payment.getAmount(),
                    BigDecimal::add
            );
        }

        for (PaymentEntity payment : refundEvents) {
            String store =
                    payment.getOrder()
                            .getWarehouse()
                            .getStore()
                            .getName();

            refunded.merge(
                    store,
                    payment.getAmount(),
                    BigDecimal::add
            );
        }

        List<String> categories =
                new ArrayList<>(
                        gross.keySet()
                );

        for (String store : refunded.keySet()) {
            if (!categories.contains(store)) {
                categories.add(store);
            }
        }

        categories.sort(
                String.CASE_INSENSITIVE_ORDER
        );

        List<BigDecimal> data =
                categories
                        .stream()
                        .map(
                                store ->
                                        money(
                                                gross.getOrDefault(
                                                        store,
                                                        BigDecimal.ZERO
                                                ).subtract(
                                                        refunded.getOrDefault(
                                                                store,
                                                                BigDecimal.ZERO
                                                        )
                                                )
                                        )
                        )
                        .toList();

        return new ReportChart(
                "sales-store",
                "Venta neta por sucursal",
                "BAR",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Venta neta",
                                data
                        )
                )
        );
    }

    private ReportChart ordersByChannel(
            List<OrderEntity> scopedOrders,
            Period period
    ) {
        Map<OrderChannel, Long> counts =
                new EnumMap<>(
                        OrderChannel.class
                );

        for (OrderChannel channel :
                OrderChannel.values()) {
            counts.put(
                    channel,
                    0L
            );
        }

        for (OrderEntity order : scopedOrders) {
            if (
                    inPeriod(
                            order.getCreatedAt(),
                            period
                    )
            ) {
                counts.compute(
                        order.getOrderChannel(),
                        (key, value) ->
                                value == null
                                        ? 1L
                                        : value + 1
                );
            }
        }

        List<String> categories =
                List.of(
                        "Ecommerce",
                        "POS"
                );

        List<BigDecimal> data =
                List.of(
                        BigDecimal.valueOf(
                                counts.getOrDefault(
                                        OrderChannel.ECOMMERCE,
                                        0L
                                )
                        ),
                        BigDecimal.valueOf(
                                counts.getOrDefault(
                                        OrderChannel.POS,
                                        0L
                                )
                        )
                );

        return new ReportChart(
                "orders-channel",
                "Pedidos por canal",
                "DONUT",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Pedidos",
                                data
                        )
                )
        );
    }

    private ReportChart paymentsByMethod(
            List<PaymentEntity> paidEvents
    ) {
        Map<PaymentMethod, BigDecimal> totals =
                new EnumMap<>(
                        PaymentMethod.class
                );

        for (PaymentEntity payment : paidEvents) {
            totals.merge(
                    payment.getMethod(),
                    payment.getAmount(),
                    BigDecimal::add
            );
        }

        List<PaymentMethod> methods =
                new ArrayList<>(
                        totals.keySet()
                );

        methods.sort(
                Comparator.comparing(
                        Enum::name
                )
        );

        List<String> categories =
                methods
                        .stream()
                        .map(
                                this::paymentMethodLabel
                        )
                        .toList();

        List<BigDecimal> data =
                methods
                        .stream()
                        .map(
                                method ->
                                        money(
                                                totals.get(method)
                                        )
                        )
                        .toList();

        return new ReportChart(
                "payments-method",
                "Cobros por método",
                "DONUT",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Cobrado",
                                data
                        )
                )
        );
    }

    private ReportChart inventoryByStore(
            List<InventoryStockEntity> scopedStocks
    ) {
        Map<String, Long> totals =
                new HashMap<>();

        for (InventoryStockEntity stock :
                scopedStocks) {
            String store =
                    stock.getWarehouse()
                            .getStore()
                            .getName();

            totals.merge(
                    store,
                    (long) stock.getAvailableQuantity(),
                    Long::sum
            );
        }

        List<String> categories =
                new ArrayList<>(
                        totals.keySet()
                );

        categories.sort(
                String.CASE_INSENSITIVE_ORDER
        );

        List<BigDecimal> data =
                categories
                        .stream()
                        .map(
                                store ->
                                        BigDecimal.valueOf(
                                                totals.get(store)
                                        )
                        )
                        .toList();

        return new ReportChart(
                "inventory-store",
                "Stock disponible por sucursal",
                "BAR",
                categories,
                List.of(
                        new ReportChart.Series(
                                "Unidades disponibles",
                                data
                        )
                )
        );
    }

    private ProductRanking topProducts(
            List<PaymentEntity> paidEvents,
            Period period
    ) {
        Set<UUID> retainedPaidOrderIds =
                new LinkedHashSet<>();

        for (PaymentEntity payment : paidEvents) {
            if (
                    payment.getStatus()
                            == PaymentStatus.PAID
                    && inPeriod(
                            payment.getPaidAt(),
                            period
                    )
            ) {
                retainedPaidOrderIds.add(
                        payment.getOrder().getId()
                );
            }
        }

        Map<String, Long> quantities =
                new HashMap<>();

        Map<String, BigDecimal> revenues =
                new HashMap<>();

        for (OrderItemEntity item :
                orderItems.findAll()) {
            if (
                    !retainedPaidOrderIds.contains(
                            item.getOrder().getId()
                    )
            ) {
                continue;
            }

            String product =
                    item.getProductName();

            quantities.merge(
                    product,
                    (long) item.getQuantity(),
                    Long::sum
            );

            revenues.merge(
                    product,
                    item.getSubtotal(),
                    BigDecimal::add
            );
        }

        List<String> products =
                new ArrayList<>(
                        revenues.keySet()
                );

        products.sort(
                (left, right) ->
                        revenues.get(right)
                                .compareTo(
                                        revenues.get(left)
                                )
        );

        List<List<String>> rows =
                new ArrayList<>();

        int limit =
                Math.min(
                        products.size(),
                        10
                );

        for (int index = 0; index < limit; index++) {
            String product =
                    products.get(index);

            rows.add(
                    List.of(
                            product,
                            String.valueOf(
                                    quantities.getOrDefault(
                                            product,
                                            0L
                                    )
                            ),
                            money(
                                    revenues.getOrDefault(
                                            product,
                                            BigDecimal.ZERO
                                    )
                            ).toPlainString()
                    )
            );
        }

        ReportTable table =
                new ReportTable(
                        "top-products",
                        "Top productos por venta confirmada",
                        List.of(
                                "Producto",
                                "Unidades",
                                "Venta Bs"
                        ),
                        rows
                );

        String topProduct =
                products.isEmpty()
                        ? null
                        : products.get(0);

        return new ProductRanking(
                table,
                topProduct
        );
    }

    private List<String> buildDeterministicInsights(
            BigDecimal netSales,
            BigDecimal refunds,
            long createdOrders,
            long cancelledOrders,
            long lowStockVariants,
            ProductRanking ranking
    ) {
        List<String> insights =
                new ArrayList<>();

        if (netSales.signum() > 0) {
            insights.add(
                    "La venta neta del período fue de Bs "
                            + money(netSales).toPlainString()
                            + "."
            );
        }

        if (createdOrders > 0) {
            BigDecimal cancellationRate =
                    BigDecimal.valueOf(
                            cancelledOrders * 100.0
                                    / createdOrders
                    ).setScale(
                            1,
                            RoundingMode.HALF_UP
                    );

            insights.add(
                    "La tasa de cancelación del período fue "
                            + cancellationRate.toPlainString()
                            + "%."
            );
        }

        if (refunds.signum() > 0) {
            insights.add(
                    "Se registraron reembolsos por Bs "
                            + money(refunds).toPlainString()
                            + "."
            );
        }

        if (ranking.topProduct() != null) {
            insights.add(
                    "El producto con mayor venta confirmada fue "
                            + ranking.topProduct()
                            + "."
            );
        }

        if (lowStockVariants > 0) {
            insights.add(
                    lowStockVariants
                            + " variantes tienen 3 unidades disponibles o menos."
            );
        }

        if (insights.isEmpty()) {
            insights.add(
                    "No existen suficientes operaciones en el período para destacar tendencias."
            );
        }

        return List.copyOf(
                insights
        );
    }

    private BigDecimal sumPayments(
            List<PaymentEntity> events
    ) {
        BigDecimal total =
                BigDecimal.ZERO;

        for (PaymentEntity payment : events) {
            total =
                    total.add(
                            payment.getAmount()
                    );
        }

        return money(total);
    }

    private boolean matchesScope(
            Scope scope,
            UUID storeId
    ) {
        return scope.storeId() == null
                || scope.storeId().equals(
                        storeId
                );
    }

    private boolean inPeriod(
            Instant value,
            Period period
    ) {
        return value != null
                && !value.isBefore(
                        period.start()
                )
                && value.isBefore(
                        period.endExclusive()
                );
    }

    private LocalDate localDate(
            Instant instant
    ) {
        return instant.atZone(
                REPORT_ZONE
        ).toLocalDate();
    }

    private BigDecimal money(
            BigDecimal value
    ) {
        return value.setScale(
                2,
                RoundingMode.HALF_UP
        );
    }

    private String paymentMethodLabel(
            PaymentMethod method
    ) {
        return switch (method) {
            case COD -> "Contra entrega";
            case CASH -> "Efectivo";
            case CARD -> "Tarjeta";
            case WEB -> "Pago web";
            case QR -> "QR";
        };
    }

    private record Scope(
            UUID storeId,
            String label
    ) {}

    private record Period(
            LocalDate from,
            LocalDate to,
            Instant start,
            Instant endExclusive
    ) {}

    private record ProductRanking(
            ReportTable table,
            String topProduct
    ) {}
}