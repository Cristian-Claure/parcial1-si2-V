package com.velora.payment;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.order.OrderEntity;
import com.velora.order.OrderRepository;
import com.velora.order.OrderStatus;
import com.velora.payment.dto.ConfirmPaymentRequest;
import com.velora.payment.dto.CreatePaymentRequest;
import com.velora.payment.dto.PaymentActionRequest;
import com.velora.payment.dto.PaymentHistoryResponse;
import com.velora.payment.dto.PaymentResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentService {

    private final PaymentRepository payments;
    private final PaymentStatusHistoryRepository history;
    private final OrderRepository orders;
    private final UserRepository users;
    private final StripePaymentOperationsService stripeOperations;

    public PaymentService(
            PaymentRepository payments,
            PaymentStatusHistoryRepository history,
            OrderRepository orders,
            UserRepository users,
            StripePaymentOperationsService stripeOperations
    ) {
        this.payments = payments;
        this.history = history;
        this.orders = orders;
        this.users = users;
        this.stripeOperations = stripeOperations;
    }

    @Transactional
    public PaymentResponse create(
            UUID customerId,
            UUID orderId,
            CreatePaymentRequest request
    ) {
        UserEntity customer =
                requireCustomer(customerId);

        /*
         * Bloqueamos el pedido para serializar intentos simultáneos
         * de creación de pago para el mismo pedido.
         */
        OrderEntity order = orders
                .findForUpdateById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        if (!order.getCustomer()
                .getId()
                .equals(customerId)) {
            /*
             * Respondemos 404 y no 403 para no revelar la existencia
             * de pedidos pertenecientes a otros clientes.
             */
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Pedido no encontrado."
            );
        }

        if (order.getStatus() != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden iniciarse pagos para pedidos reservados."
            );
        }

        if (payments.existsByOrderIdAndStatus(
                orderId,
                PaymentStatus.PAID
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido ya tiene un pago confirmado."
            );
        }

        if (payments.existsByOrderIdAndStatus(
                orderId,
                PaymentStatus.PENDING
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido ya tiene un pago pendiente."
            );
        }

        PaymentEntity payment =
                new PaymentEntity();

        payment.setOrder(order);
        payment.setMethod(request.method());
        payment.setStatus(PaymentStatus.PENDING);

        /*
         * El importe jamás se confía al cliente.
         * Se toma del total congelado del pedido.
         */
        payment.setAmount(order.getTotal());
        payment.setCurrency(order.getCurrency());

        payment.setNotes(request.notes());
        payment.setCreatedBy(customer);

        payments.saveAndFlush(payment);

        registerHistory(
                payment,
                null,
                PaymentStatus.PENDING,
                customer,
                "Pago iniciado por el cliente."
        );

        history.flush();

        return PaymentResponse.from(payment);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> listForCustomerOrder(
            UUID customerId,
            UUID orderId
    ) {
        requireCustomer(customerId);

        requireCustomerOrder(
                customerId,
                orderId
        );

        return payments
                .findAllByOrderIdOrderByCreatedAtDesc(
                        orderId
                )
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PaymentResponse getForCustomer(
            UUID customerId,
            UUID paymentId
    ) {
        requireCustomer(customerId);

        PaymentEntity payment = payments
                .findByIdAndCustomer(
                        paymentId,
                        customerId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        return PaymentResponse.from(payment);
    }

    @Transactional(readOnly = true)
    public List<PaymentHistoryResponse> historyForCustomer(
            UUID customerId,
            UUID paymentId
    ) {
        requireCustomer(customerId);

        PaymentEntity payment = payments
                .findByIdAndCustomer(
                        paymentId,
                        customerId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        return history
                .findAllByPaymentIdOrderByCreatedAtAsc(
                        payment.getId()
                )
                .stream()
                .map(PaymentHistoryResponse::from)
                .toList();
    }

    @Transactional
    public PaymentResponse confirmPaid(
            UUID actorId,
            UUID paymentId,
            ConfirmPaymentRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        /*
         * Lectura inicial únicamente para conocer el pedido y validar
         * la sucursal antes de ejecutar cambios.
         */
        PaymentEntity initial = payments
                .findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        validateStoreAccess(
                actor,
                initial.getOrder()
        );

        /*
         * Mantenemos orden consistente de locks:
         * ORDER -> PAYMENT.
         */
        OrderEntity lockedOrder = orders
                .findForUpdateById(
                        initial.getOrder().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        validateStoreAccess(
                actor,
                lockedOrder
        );

        PaymentEntity payment = payments
                .findForUpdateById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        if (!payment.getOrder()
                .getId()
                .equals(lockedOrder.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no corresponde al pedido bloqueado."
            );
        }

        if (lockedOrder.getStatus()
                == OrderStatus.CANCELLED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "No puede confirmarse un pago de un pedido cancelado."
            );
        }

        if (payment.getStatus()
                != PaymentStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden confirmarse pagos pendientes."
            );
        }

        if (stripeOperations.supports(payment)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Los pagos Stripe se confirman exclusivamente mediante webhook firmado."
            );
        }

        if (payments.existsByOrderIdAndStatus(
                lockedOrder.getId(),
                PaymentStatus.PAID
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido ya tiene un pago confirmado."
            );
        }

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(
                PaymentStatus.PAID
        );

        payment.setProcessedBy(actor);
        payment.setPaidAt(Instant.now());

        payments.saveAndFlush(payment);

        String reason = normalizeReason(
                request.reason(),
                "Pago confirmado."
        );

        registerHistory(
                payment,
                previous,
                PaymentStatus.PAID,
                actor,
                reason
        );

        history.flush();

        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentResponse cancelPending(
            UUID customerId,
            UUID paymentId,
            PaymentActionRequest request
    ) {
        UserEntity customer =
                requireCustomer(customerId);

        PaymentEntity initial = payments
                .findByIdAndCustomer(
                        paymentId,
                        customerId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        OrderEntity lockedOrder = orders
                .findForUpdateById(
                        initial.getOrder().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        if (!lockedOrder.getCustomer()
                .getId()
                .equals(customerId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Pago no encontrado."
            );
        }

        if (lockedOrder.getStatus()
                != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden cancelarse pagos de pedidos reservados."
            );
        }

        PaymentEntity payment = payments
                .findForUpdateById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        if (!payment.getOrder()
                .getId()
                .equals(lockedOrder.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no corresponde al pedido bloqueado."
            );
        }

        if (payment.getStatus()
                != PaymentStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden cancelarse pagos pendientes."
            );
        }

        stripeOperations.expirePendingCheckoutIfNeeded(
                payment
        );

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(
                PaymentStatus.CANCELLED
        );

        payment.setProcessedBy(customer);
        payment.setCancelledAt(
                Instant.now()
        );

        payments.saveAndFlush(payment);

        registerHistory(
                payment,
                previous,
                PaymentStatus.CANCELLED,
                customer,
                normalizeReason(
                        request.reason(),
                        "Pago cancelado por el cliente."
                )
        );

        history.flush();

        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentResponse markFailed(
            UUID actorId,
            UUID paymentId,
            PaymentActionRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        PaymentEntity initial = payments
                .findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        validateStoreAccess(
                actor,
                initial.getOrder()
        );

        OrderEntity lockedOrder = orders
                .findForUpdateById(
                        initial.getOrder().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        validateStoreAccess(
                actor,
                lockedOrder
        );

        if (lockedOrder.getStatus()
                != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden marcarse como fallidos pagos de pedidos reservados."
            );
        }

        PaymentEntity payment = payments
                .findForUpdateById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        if (!payment.getOrder()
                .getId()
                .equals(lockedOrder.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no corresponde al pedido bloqueado."
            );
        }

        if (payment.getStatus()
                != PaymentStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden marcarse como fallidos pagos pendientes."
            );
        }

        if (stripeOperations.supports(payment)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Los pagos Stripe cambian a fallido únicamente mediante eventos firmados de Stripe."
            );
        }

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(
                PaymentStatus.FAILED
        );

        payment.setProcessedBy(actor);
        payment.setFailedAt(
                Instant.now()
        );

        payments.saveAndFlush(payment);

        registerHistory(
                payment,
                previous,
                PaymentStatus.FAILED,
                actor,
                normalizeReason(
                        request.reason(),
                        "Intento de pago fallido."
                )
        );

        history.flush();

        return PaymentResponse.from(payment);
    }

    @Transactional
    public PaymentResponse refund(
            UUID actorId,
            UUID paymentId,
            PaymentActionRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        PaymentEntity initial = payments
                .findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        validateStoreAccess(
                actor,
                initial.getOrder()
        );

        OrderEntity lockedOrder = orders
                .findForUpdateById(
                        initial.getOrder().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        validateStoreAccess(
                actor,
                lockedOrder
        );

        if (lockedOrder.getStatus()
                != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden reembolsarse pagos antes de la entrega del pedido."
            );
        }

        PaymentEntity payment = payments
                .findForUpdateById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        if (!payment.getOrder()
                .getId()
                .equals(lockedOrder.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no corresponde al pedido bloqueado."
            );
        }

        if (payment.getStatus()
                != PaymentStatus.PAID) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden reembolsarse pagos confirmados."
            );
        }

        String stripeRefundId =
                stripeOperations.refundPaidPaymentIfNeeded(
                        payment
                );

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(
                PaymentStatus.REFUNDED
        );

        payment.setProcessedBy(actor);
        payment.setRefundedAt(
                Instant.now()
        );

        payments.saveAndFlush(payment);

        String refundReason =
                normalizeReason(
                        request.reason(),
                        "Pago reembolsado."
                );

        if (stripeRefundId != null) {
            refundReason =
                    refundReason
                            + " Referencia Stripe: "
                            + stripeRefundId
                            + ".";
        }

        registerHistory(
                payment,
                previous,
                PaymentStatus.REFUNDED,
                actor,
                refundReason
        );

        history.flush();

        return PaymentResponse.from(payment);
    }
    private void registerHistory(
            PaymentEntity payment,
            PaymentStatus fromStatus,
            PaymentStatus toStatus,
            UserEntity actor,
            String reason
    ) {
        PaymentStatusHistoryEntity entry =
                new PaymentStatusHistoryEntity();

        entry.setPayment(payment);
        entry.setFromStatus(fromStatus);
        entry.setToStatus(toStatus);
        entry.setChangedBy(actor);
        entry.setReason(reason);

        history.save(entry);
    }

    private OrderEntity requireCustomerOrder(
            UUID customerId,
            UUID orderId
    ) {
        return orders
                .findByIdAndCustomerId(
                        orderId,
                        customerId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));
    }

    private UserEntity requireCustomer(
            UUID userId
    ) {
        UserEntity user = users
                .findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));

        if (user.getRole()
                != UserRole.CUSTOMER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La operación está disponible únicamente para clientes."
            );
        }

        return user;
    }

    private UserEntity requireOperationalActor(
            UUID userId
    ) {
        UserEntity user = users
                .findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));

        if (user.getRole() != UserRole.ADMIN
                && user.getRole()
                    != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para procesar pagos."
            );
        }

        return user;
    }

    private void validateStoreAccess(
            UserEntity actor,
            OrderEntity order
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

        UUID actorStoreId =
                actor.getStore().getId();

        UUID orderStoreId =
                order.getWarehouse()
                        .getStore()
                        .getId();

        if (!actorStoreId.equals(orderStoreId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede procesar pagos de otra sucursal."
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