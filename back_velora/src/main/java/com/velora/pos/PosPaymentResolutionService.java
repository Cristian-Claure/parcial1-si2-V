package com.velora.pos;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.velora.inventory.InventoryMovementEntity;
import com.velora.inventory.InventoryMovementRepository;
import com.velora.inventory.InventoryMovementType;
import com.velora.inventory.InventoryStockEntity;
import com.velora.inventory.InventoryStockRepository;
import com.velora.order.OrderChannel;
import com.velora.order.OrderEntity;
import com.velora.order.OrderItemEntity;
import com.velora.order.OrderItemRepository;
import com.velora.order.OrderRepository;
import com.velora.order.OrderStatus;
import com.velora.payment.PaymentEntity;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentRepository;
import com.velora.payment.PaymentStatus;
import com.velora.payment.PaymentStatusHistoryEntity;
import com.velora.payment.PaymentStatusHistoryRepository;
import com.velora.payment.dto.PaymentActionRequest;
import com.velora.pos.dto.PosPaymentResolutionResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PosPaymentResolutionService {

    private final PaymentRepository payments;
    private final PaymentStatusHistoryRepository paymentHistory;
    private final OrderRepository orders;
    private final OrderItemRepository orderItems;
    private final InventoryStockRepository stocks;
    private final InventoryMovementRepository movements;
    private final UserRepository users;

    public PosPaymentResolutionService(
            PaymentRepository payments,
            PaymentStatusHistoryRepository paymentHistory,
            OrderRepository orders,
            OrderItemRepository orderItems,
            InventoryStockRepository stocks,
            InventoryMovementRepository movements,
            UserRepository users
    ) {
        this.payments = payments;
        this.paymentHistory = paymentHistory;
        this.orders = orders;
        this.orderItems = orderItems;
        this.stocks = stocks;
        this.movements = movements;
        this.users = users;
    }

    @Transactional
    public PosPaymentResolutionResponse fail(
            UUID actorId,
            UUID paymentId,
            PaymentActionRequest request
    ) {
        return resolve(
                actorId,
                paymentId,
                PaymentStatus.FAILED,
                request.reason()
        );
    }

    @Transactional
    public PosPaymentResolutionResponse cancel(
            UUID actorId,
            UUID paymentId,
            PaymentActionRequest request
    ) {
        return resolve(
                actorId,
                paymentId,
                PaymentStatus.CANCELLED,
                request.reason()
        );
    }

    private PosPaymentResolutionResponse resolve(
            UUID actorId,
            UUID paymentId,
            PaymentStatus targetStatus,
            String reason
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        PaymentEntity initial =
                payments.findById(paymentId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Pago no encontrado."
                        ));

        OrderEntity order =
                orders.findForUpdateById(
                        initial.getOrder().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        validateStoreAccess(
                actor,
                order
        );

        if (order.getOrderChannel()
                != OrderChannel.POS) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no pertenece a una venta POS."
            );
        }

        if (order.getStatus()
                != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La venta POS ya no se encuentra reservada."
            );
        }

        PaymentEntity payment =
                payments.findForUpdateById(paymentId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Pago no encontrado."
                        ));

        if (!payment.getOrder()
                .getId()
                .equals(order.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no corresponde al pedido bloqueado."
            );
        }

        if (payment.getMethod() != PaymentMethod.CARD
                && payment.getMethod() != PaymentMethod.QR) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden resolverse por este flujo pagos CARD o QR."
            );
        }

        if (payment.getStatus()
                != PaymentStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago POS ya no se encuentra pendiente."
            );
        }

        List<OrderItemEntity> lines =
                new ArrayList<>(
                        orderItems
                                .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                        order.getId()
                                )
                );

        lines.sort(
                Comparator.comparing(
                        line -> line
                                .getVariant()
                                .getId()
                                .toString()
                )
        );

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        for (OrderItemEntity line : lines) {

            InventoryStockEntity stock =
                    stocks.findForUpdate(
                            order.getWarehouse().getId(),
                            line.getVariant().getId()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "No existe el stock asociado a la reserva POS."
                    ));

            if (stock.getCommittedQuantity()
                    < line.getQuantity()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "La reserva de inventario POS es inconsistente."
                );
            }

            lockedStocks.put(
                    line.getVariant().getId(),
                    stock
            );
        }

        for (OrderItemEntity line : lines) {

            InventoryStockEntity stock =
                    lockedStocks.get(
                            line.getVariant().getId()
                    );

            releaseStock(
                    stock,
                    line.getQuantity(),
                    order,
                    actor,
                    targetStatus
            );
        }

        Instant resolvedAt =
                Instant.now();

        PaymentStatus previousStatus =
                payment.getStatus();

        payment.setStatus(
                targetStatus
        );

        payment.setProcessedBy(
                actor
        );

        if (targetStatus == PaymentStatus.FAILED) {
            payment.setFailedAt(
                    resolvedAt
            );
        } else {
            payment.setCancelledAt(
                    resolvedAt
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
                previousStatus
        );

        history.setToStatus(
                targetStatus
        );

        history.setChangedBy(
                actor
        );

        history.setReason(
                normalizeReason(
                        reason,
                        targetStatus == PaymentStatus.FAILED
                                ? "Pago POS fallido."
                                : "Pago POS cancelado."
                )
        );

        paymentHistory.saveAndFlush(
                history
        );

        order.setStatus(
                OrderStatus.CANCELLED
        );

        order.setCancelledAt(
                resolvedAt
        );

        orders.saveAndFlush(
                order
        );

        stocks.flush();
        movements.flush();

        return new PosPaymentResolutionResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getStatus(),

                payment.getId(),
                payment.getMethod(),
                payment.getStatus(),

                order.getTotal(),
                order.getCurrency(),
                resolvedAt
        );
    }

    private void releaseStock(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity actor,
            PaymentStatus paymentStatus
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int committedAfter =
                committedBefore - quantity;

        if (committedAfter < 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La reserva POS no puede liberarse porque el stock comprometido es inconsistente."
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
                InventoryMovementType.RELEASE
        );

        movement.setQuantity(
                quantity
        );

        movement.setPhysicalDelta(0);
        movement.setCommittedDelta(
                -quantity
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
                paymentStatus == PaymentStatus.FAILED
                        ? "Liberación por pago POS fallido "
                                + order.getOrderNumber()
                        : "Liberación por cancelación de pago POS "
                                + order.getOrderNumber()
        );

        movement.setPerformedBy(
                actor
        );

        movements.save(
                movement
        );
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

        if (actor.getRole() != UserRole.ADMIN
                && actor.getRole()
                != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para resolver pagos POS."
            );
        }

        return actor;
    }

    private void validateStoreAccess(
            UserEntity actor,
            OrderEntity order
    ) {
        if (actor.getRole()
                == UserRole.ADMIN) {
            return;
        }

        if (actor.getStore() == null
                || order.getPointOfSale() == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No existe una sucursal válida para la operación."
            );
        }

        if (!actor.getStore()
                .getId()
                .equals(
                        order.getPointOfSale()
                                .getStore()
                                .getId()
                )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede resolver pagos de otra sucursal."
            );
        }
    }

    private String normalizeReason(
            String reason,
            String fallback
    ) {
        if (reason == null
                || reason.isBlank()) {
            return fallback;
        }

        return reason.trim();
    }
}