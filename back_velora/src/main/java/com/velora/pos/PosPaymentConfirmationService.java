package com.velora.pos;

import java.util.UUID;

import com.velora.order.OrderChannel;
import com.velora.order.OrderService;
import com.velora.payment.PaymentEntity;
import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentRepository;
import com.velora.payment.dto.PaymentResponse;
import com.velora.payment.PaymentService;
import com.velora.payment.PaymentStatus;
import com.velora.payment.dto.ConfirmPaymentRequest;
import com.velora.pos.dto.ConfirmPosPaymentRequest;
import com.velora.pos.dto.PosPaymentConfirmationResponse;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PosPaymentConfirmationService {

    private final PaymentRepository payments;
    private final PaymentService paymentService;
    private final OrderService orderService;

    public PosPaymentConfirmationService(
            PaymentRepository payments,
            PaymentService paymentService,
            OrderService orderService
    ) {
        this.payments = payments;
        this.paymentService = paymentService;
        this.orderService = orderService;
    }

    @Transactional
    public PosPaymentConfirmationResponse confirm(
            UUID actorId,
            UUID paymentId,
            ConfirmPosPaymentRequest request
    ) {
        PaymentEntity initial =
                payments.findById(paymentId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Pago no encontrado."
                        ));

        if (initial.getOrder()
                .getOrderChannel()
                != OrderChannel.POS) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago no pertenece a una venta POS."
            );
        }

        if (initial.getMethod()
                != PaymentMethod.CARD
                && initial.getMethod()
                != PaymentMethod.QR) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo se confirma por este flujo un pago CARD o QR."
            );
        }

        if (initial.getStatus()
                != PaymentStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago POS no se encuentra pendiente."
            );
        }

        CashSessionEntity cashSession =
                initial.getOrder()
                        .getCashSession();

        if (cashSession == null
                || cashSession.getStatus()
                != CashSessionStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La caja asociada a la venta ya no está abierta."
            );
        }

        PaymentResponse confirmed =
                paymentService.confirmPaid(
                        actorId,
                        paymentId,
                        new ConfirmPaymentRequest(
                                request.reason()
                        )
                );

        com.velora.order.dto.OrderResponse fulfilled =
                orderService.fulfill(
                        actorId,
                        initial.getOrder().getId()
                );

        return new PosPaymentConfirmationResponse(
                fulfilled.id(),
                fulfilled.orderNumber(),
                fulfilled.status(),

                confirmed.id(),
                confirmed.method(),
                confirmed.status(),

                fulfilled.total(),
                fulfilled.currency(),
                fulfilled.fulfilledAt()
        );
    }
}