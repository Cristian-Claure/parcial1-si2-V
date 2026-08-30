package com.velora.pos;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.catalog.variant.ProductVariantRepository;
import com.velora.inventory.InventoryMovementEntity;
import com.velora.inventory.InventoryMovementRepository;
import com.velora.inventory.InventoryMovementType;
import com.velora.inventory.InventoryStockEntity;
import com.velora.inventory.InventoryStockRepository;
import com.velora.order.FulfillmentType;
import com.velora.order.OrderChannel;
import com.velora.order.OrderEntity;
import com.velora.order.OrderItemEntity;
import com.velora.order.OrderItemRepository;
import com.velora.order.OrderRepository;
import com.velora.order.OrderStatus;
import com.velora.order.dto.OrderItemResponse;
import com.velora.payment.PaymentEntity;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentRepository;
import com.velora.payment.PaymentStatus;
import com.velora.payment.PaymentStatusHistoryEntity;
import com.velora.payment.PaymentStatusHistoryRepository;
import com.velora.pos.dto.CreatePosSaleRequest;
import com.velora.pos.dto.PosSaleItemRequest;
import com.velora.pos.dto.PosSaleResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PosSaleService {

    private final CashSessionRepository cashSessions;
    private final ProductVariantRepository variants;
    private final InventoryStockRepository stocks;
    private final InventoryMovementRepository inventoryMovements;
    private final OrderRepository orders;
    private final OrderItemRepository orderItems;
    private final PaymentRepository payments;
    private final PaymentStatusHistoryRepository paymentHistory;
    private final UserRepository users;

    public PosSaleService(
            CashSessionRepository cashSessions,
            ProductVariantRepository variants,
            InventoryStockRepository stocks,
            InventoryMovementRepository inventoryMovements,
            OrderRepository orders,
            OrderItemRepository orderItems,
            PaymentRepository payments,
            PaymentStatusHistoryRepository paymentHistory,
            UserRepository users
    ) {
        this.cashSessions = cashSessions;
        this.variants = variants;
        this.stocks = stocks;
        this.inventoryMovements = inventoryMovements;
        this.orders = orders;
        this.orderItems = orderItems;
        this.payments = payments;
        this.paymentHistory = paymentHistory;
        this.users = users;
    }

    @Transactional
    public PosSaleResponse create(
            UUID actorId,
            CreatePosSaleRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        OrderEntity existingOrder =
                orders.findByClientOperationId(
                        request.clientOperationId()
                )
                .orElse(null);

        if (existingOrder != null) {
            return responseForExistingOperation(
                    actor,
                    existingOrder,
                    request
            );
        }

        validatePaymentMethod(
                request.paymentMethod()
        );

        boolean cashPayment =
                request.paymentMethod()
                        == PaymentMethod.CASH;

        CashSessionEntity cashSession =
                cashSessions
                        .findForUpdateById(
                                request.cashSessionId()
                        )
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Sesión de caja no encontrada."
                        ));

        if (cashSession.getStatus()
                != CashSessionStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La venta requiere una caja abierta."
            );
        }

        PointOfSaleEntity pointOfSale =
                cashSession.getPointOfSale();

        if (!pointOfSale.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El punto de venta está inactivo."
            );
        }

        if (!pointOfSale
                .getWarehouse()
                .isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén del punto de venta está inactivo."
            );
        }

        validateStoreAccess(
                actor,
                pointOfSale
        );

        existingOrder =
                orders.findByClientOperationId(
                        request.clientOperationId()
                )
                .orElse(null);

        if (existingOrder != null) {
            return responseForExistingOperation(
                    actor,
                    existingOrder,
                    request
            );
        }

        UserEntity customer =
                resolveCustomer(
                        request.customerId()
                );

        Map<UUID, Integer> quantities =
                normalizeItems(
                        request.items()
                );

        List<UUID> variantIds =
                new ArrayList<>(
                        quantities.keySet()
                );

        variantIds.sort(
                Comparator.comparing(
                        UUID::toString
                )
        );

        Map<UUID, ProductVariantEntity> saleVariants =
                new LinkedHashMap<>();

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        BigDecimal subtotal =
                BigDecimal.ZERO;

        String currency =
                null;

        for (UUID variantId : variantIds) {

            ProductVariantEntity variant =
                    variants.findById(variantId)
                            .orElseThrow(() -> new ResponseStatusException(
                                    HttpStatus.NOT_FOUND,
                                    "Variante no encontrada: " + variantId
                            ));

            validatePurchasableVariant(
                    variant
            );

            if (currency == null) {
                currency = variant.getCurrency();

            } else if (!currency.equals(
                    variant.getCurrency()
            )) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "La venta contiene variantes con monedas diferentes."
                );
            }

            int quantity =
                    quantities.get(
                            variantId
                    );

            InventoryStockEntity stock =
                    stocks.findForUpdate(
                            pointOfSale
                                    .getWarehouse()
                                    .getId(),
                            variantId
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "La variante "
                                    + variant.getSku()
                                    + " no tiene stock en el almacén del POS."
                    ));

            if (stock.getAvailableQuantity()
                    < quantity) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stock disponible insuficiente para "
                                + variant.getSku()
                                + ". Disponible: "
                                + stock.getAvailableQuantity()
                                + ", solicitado: "
                                + quantity
                                + "."
                );
            }

            saleVariants.put(
                    variantId,
                    variant
            );

            lockedStocks.put(
                    variantId,
                    stock
            );

            subtotal =
                    subtotal.add(
                            variant.getPrice()
                                    .multiply(
                                            BigDecimal.valueOf(
                                                    quantity
                                            )
                                    )
                    );
        }

        OrderEntity order =
                new OrderEntity();

        order.setOrderNumber(
                generateOrderNumber()
        );

        order.setOrderChannel(
                OrderChannel.POS
        );

        order.setClientOperationId(
                request.clientOperationId()
        );

        order.setClientCreatedAt(
                request.clientCreatedAt()
        );

        order.setSyncedAt(
                Instant.now()
        );

        order.setCustomer(
                customer
        );

        order.setSourceCart(null);

        order.setPointOfSale(
                pointOfSale
        );

        order.setCashSession(
                cashSession
        );

        order.setWarehouse(
                pointOfSale.getWarehouse()
        );

        order.setFulfillmentType(
                FulfillmentType.IN_STORE
        );

        order.setStatus(
                cashPayment
                        ? OrderStatus.FULFILLED
                        : OrderStatus.RESERVED
        );

        order.setCurrency(
                currency
        );

        order.setSubtotal(
                subtotal
        );

        order.setTotal(
                subtotal
        );

        order.setNotes(
                request.notes()
        );

        if (cashPayment) {
            order.setFulfilledAt(
                    Instant.now()
            );
        }

        orders.saveAndFlush(
                order
        );

        List<OrderItemEntity> snapshots =
                new ArrayList<>();

        for (UUID variantId : variantIds) {

            ProductVariantEntity variant =
                    saleVariants.get(
                            variantId
                    );

            int quantity =
                    quantities.get(
                            variantId
                    );

            BigDecimal lineSubtotal =
                    variant.getPrice()
                            .multiply(
                                    BigDecimal.valueOf(
                                            quantity
                                    )
                            );

            OrderItemEntity item =
                    new OrderItemEntity();

            item.setOrder(order);
            item.setVariant(variant);

            item.setProductName(
                    variant
                            .getProduct()
                            .getName()
            );

            item.setSku(
                    variant.getSku()
            );

            item.setSize(
                    variant.getSize()
            );

            item.setColor(
                    variant.getColor()
            );

            item.setUnitPrice(
                    variant.getPrice()
            );

            item.setCurrency(
                    variant.getCurrency()
            );

            item.setQuantity(
                    quantity
            );

            item.setSubtotal(
                    lineSubtotal
            );

            snapshots.add(
                    item
            );
        }

        orderItems.saveAll(
                snapshots
        );

        orderItems.flush();

        for (UUID variantId : variantIds) {

            InventoryStockEntity stock =
                    lockedStocks.get(
                            variantId
                    );

            int quantity =
                    quantities.get(
                            variantId
                    );

            if (cashPayment) {
                applyImmediateSale(
                        stock,
                        quantity,
                        order,
                        actor
                );
            } else {
                reserveStock(
                        stock,
                        quantity,
                        order,
                        actor
                );
            }
        }

        stocks.flush();
        inventoryMovements.flush();

        PaymentEntity payment =
                new PaymentEntity();

        payment.setOrder(
                order
        );

        payment.setMethod(
                request.paymentMethod()
        );

        payment.setStatus(
                cashPayment
                        ? PaymentStatus.PAID
                        : PaymentStatus.PENDING
        );

        payment.setAmount(
                order.getTotal()
        );

        payment.setCurrency(
                order.getCurrency()
        );

        payment.setCreatedBy(
                actor
        );

        if (cashPayment) {
            payment.setProcessedBy(
                    actor
            );

            payment.setPaidAt(
                    Instant.now()
            );

            payment.setNotes(
                    "Pago en efectivo registrado en POS."
            );
        } else {
            payment.setNotes(
                    "Pago POS pendiente de confirmación."
            );
        }

        payments.saveAndFlush(
                payment
        );

        PaymentStatusHistoryEntity history =
                new PaymentStatusHistoryEntity();

        history.setPayment(
                payment
        );

        history.setFromStatus(
                null
        );

        history.setToStatus(
                payment.getStatus()
        );

        history.setChangedBy(
                actor
        );

        history.setReason(
                cashPayment
                        ? "Pago en efectivo confirmado en POS."
                        : "Pago POS iniciado y pendiente de confirmación."
        );

        paymentHistory.saveAndFlush(
                history
        );

        List<OrderItemResponse> itemResponses =
                orderItems
                        .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                order.getId()
                        )
                        .stream()
                        .map(
                                OrderItemResponse::from
                        )
                        .toList();

        return new PosSaleResponse(
                order.getId(),
                order.getOrderNumber(),

                order.getClientOperationId(),
                order.getClientCreatedAt(),
                order.getSyncedAt(),

                order.getOrderChannel(),
                order.getStatus(),

                pointOfSale.getId(),
                pointOfSale.getCode(),

                cashSession.getId(),
                cashSession.getSessionNumber(),

                customer == null
                        ? null
                        : customer.getId(),

                payment.getMethod(),
                payment.getId(),
                payment.getStatus(),

                order.getCurrency(),
                order.getSubtotal(),
                order.getTotal(),
                order.getCreatedAt(),

                itemResponses
        );
    }

    private PosSaleResponse responseForExistingOperation(
            UserEntity actor,
            OrderEntity order,
            CreatePosSaleRequest request
    ) {
        if (order.getOrderChannel()
                != OrderChannel.POS) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación ya está en uso."
            );
        }

        if (order.getPointOfSale() == null
                || order.getCashSession() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La operación POS existente es inconsistente."
            );
        }

        validateStoreAccess(
                actor,
                order.getPointOfSale()
        );

        if (!order.getCashSession()
                .getId()
                .equals(
                        request.cashSessionId()
                )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación ya pertenece a otra sesión de caja."
            );
        }

        UUID existingCustomerId =
                order.getCustomer() == null
                        ? null
                        : order.getCustomer().getId();

        if (request.customerId() == null) {
            if (existingCustomerId != null) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "El identificador de operación fue reutilizado con otro cliente."
                );
            }
        } else if (!request.customerId()
                .equals(existingCustomerId)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación fue reutilizado con otro cliente."
            );
        }

        List<PaymentEntity> existingPayments =
                payments
                        .findAllByOrderIdOrderByCreatedAtDesc(
                                order.getId()
                        );

        if (existingPayments.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La operación POS existente no tiene pago asociado."
            );
        }

        PaymentEntity payment =
                existingPayments.get(0);

        if (payment.getMethod()
                != request.paymentMethod()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación fue reutilizado con otro método de pago."
            );
        }

        Map<UUID, Integer> requestedQuantities =
                normalizeItems(
                        request.items()
                );

        List<OrderItemEntity> storedItems =
                orderItems
                        .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                order.getId()
                        );

        Map<UUID, Integer> storedQuantities =
                new LinkedHashMap<>();

        for (OrderItemEntity item : storedItems) {
            storedQuantities.put(
                    item.getVariant().getId(),
                    item.getQuantity()
            );
        }

        if (!storedQuantities.equals(
                requestedQuantities
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación fue reutilizado con productos diferentes."
            );
        }

        List<OrderItemResponse> itemResponses =
                storedItems
                        .stream()
                        .map(
                                OrderItemResponse::from
                        )
                        .toList();

        return new PosSaleResponse(
                order.getId(),
                order.getOrderNumber(),

                order.getClientOperationId(),
                order.getClientCreatedAt(),
                order.getSyncedAt(),

                order.getOrderChannel(),
                order.getStatus(),

                order.getPointOfSale().getId(),
                order.getPointOfSale().getCode(),

                order.getCashSession().getId(),
                order.getCashSession().getSessionNumber(),

                existingCustomerId,

                payment.getMethod(),
                payment.getId(),
                payment.getStatus(),

                order.getCurrency(),
                order.getSubtotal(),
                order.getTotal(),
                order.getCreatedAt(),

                itemResponses
        );
    }

    private void validatePaymentMethod(
            PaymentMethod method
    ) {
        if (method != PaymentMethod.CASH
                && method != PaymentMethod.CARD
                && method != PaymentMethod.QR) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El POS admite únicamente CASH, CARD o QR."
            );
        }
    }

    private Map<UUID, Integer> normalizeItems(
            List<PosSaleItemRequest> items
    ) {
        Map<UUID, Integer> quantities =
                new LinkedHashMap<>();

        for (PosSaleItemRequest item : items) {

            if (quantities.containsKey(
                    item.variantId()
            )) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Una variante no puede repetirse en la venta."
                );
            }

            quantities.put(
                    item.variantId(),
                    item.quantity()
            );
        }

        return quantities;
    }

    private void reserveStock(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity actor
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int committedAfter =
                committedBefore + quantity;

        if (committedAfter
                > physicalBefore) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "No existe stock suficiente para reservar la venta POS."
            );
        }

        stock.setCommittedQuantity(
                committedAfter
        );

        stocks.save(
                stock
        );

        InventoryMovementEntity movement =
                new InventoryMovementEntity();

        movement.setWarehouse(
                stock.getWarehouse()
        );

        movement.setVariant(
                stock.getVariant()
        );

        movement.setMovementType(
                InventoryMovementType.RESERVE
        );

        movement.setQuantity(
                quantity
        );

        movement.setPhysicalDelta(0);
        movement.setCommittedDelta(
                quantity
        );

        movement.setPhysicalBefore(
                physicalBefore
        );

        movement.setPhysicalAfter(
                physicalBefore
        );

        movement.setCommittedBefore(
                committedBefore
        );

        movement.setCommittedAfter(
                committedAfter
        );

        movement.setReferenceType(
                "ORDER"
        );

        movement.setReferenceId(
                order.getId()
        );

        movement.setReason(
                "Reserva por pago POS pendiente "
                        + order.getOrderNumber()
        );

        movement.setPerformedBy(
                actor
        );

        inventoryMovements.save(
                movement
        );
    }

    private void applyImmediateSale(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity actor
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int physicalAfter =
                physicalBefore - quantity;

        if (physicalAfter < 0
                || committedBefore > physicalAfter) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El inventario no permite completar la venta POS."
            );
        }

        stock.setPhysicalQuantity(
                physicalAfter
        );

        stocks.save(
                stock
        );

        InventoryMovementEntity movement =
                new InventoryMovementEntity();

        movement.setWarehouse(
                stock.getWarehouse()
        );

        movement.setVariant(
                stock.getVariant()
        );

        movement.setMovementType(
                InventoryMovementType.SALE
        );

        movement.setQuantity(
                quantity
        );

        movement.setPhysicalDelta(
                -quantity
        );

        movement.setCommittedDelta(0);

        movement.setPhysicalBefore(
                physicalBefore
        );

        movement.setPhysicalAfter(
                physicalAfter
        );

        movement.setCommittedBefore(
                committedBefore
        );

        movement.setCommittedAfter(
                committedBefore
        );

        movement.setReferenceType(
                "ORDER"
        );

        movement.setReferenceId(
                order.getId()
        );

        movement.setReason(
                "Venta POS "
                        + order.getOrderNumber()
        );

        movement.setPerformedBy(
                actor
        );

        inventoryMovements.save(
                movement
        );
    }

    private UserEntity resolveCustomer(
            UUID customerId
    ) {
        if (customerId == null) {
            return null;
        }

        UserEntity customer =
                users.findById(customerId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Cliente no encontrado."
                        ));

        if (customer.getRole()
                != UserRole.CUSTOMER) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El usuario indicado no es un cliente."
            );
        }

        if (customer.getStatus()
                != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El cliente está inactivo."
            );
        }

        return customer;
    }

    private UserEntity requireOperationalActor(
            UUID actorId
    ) {
        UserEntity actor =
                users.findById(actorId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.UNAUTHORIZED,
                                "Usuario autenticado no encontrado."
                        ));

        if (actor.getStatus()
                != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        if (actor.getRole()
                != UserRole.ADMIN
                && actor.getRole()
                != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para registrar ventas POS."
            );
        }

        return actor;
    }

    private void validateStoreAccess(
            UserEntity actor,
            PointOfSaleEntity pointOfSale
    ) {
        if (actor.getRole()
                == UserRole.ADMIN) {
            return;
        }

        if (actor.getStore() == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        if (!actor.getStore()
                .getId()
                .equals(
                        pointOfSale
                                .getStore()
                                .getId()
                )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede registrar ventas en otra sucursal."
            );
        }
    }

    private void validatePurchasableVariant(
            ProductVariantEntity variant
    ) {
        if (!variant.isActive()
                || variant
                        .getProduct()
                        .getStatus()
                        != ProductStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La variante no está disponible para la venta."
            );
        }
    }

    private String generateOrderNumber() {
        String date =
                LocalDate.now(
                        ZoneOffset.UTC
                )
                .format(
                        DateTimeFormatter.BASIC_ISO_DATE
                );

        String random =
                UUID.randomUUID()
                        .toString()
                        .replace("-", "")
                        .substring(0, 12)
                        .toUpperCase();

        return "VEL-POS-"
                + date
                + "-"
                + random;
    }
}