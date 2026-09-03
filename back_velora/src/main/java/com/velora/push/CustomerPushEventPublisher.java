package com.velora.push;

import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class CustomerPushEventPublisher {

    private static final String ORDERS_ROUTE =
            "/mis-pedidos";

    private final ApplicationEventPublisher events;

    public CustomerPushEventPublisher(
            ApplicationEventPublisher events
    ) {
        this.events = events;
    }

    public void orderConfirmed(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pedido recibido",
                        "Tu pedido "
                                + orderNumber
                                + " fue registrado correctamente.",
                        "ORDER_CONFIRMED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void orderCancelled(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pedido cancelado",
                        "Tu pedido "
                                + orderNumber
                                + " fue cancelado.",
                        "ORDER_CANCELLED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void orderFulfilled(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pedido entregado",
                        "Tu pedido "
                                + orderNumber
                                + " fue entregado correctamente.",
                        "ORDER_FULFILLED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void paymentConfirmed(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pago confirmado",
                        "Confirmamos el pago de tu pedido "
                                + orderNumber
                                + ".",
                        "PAYMENT_CONFIRMED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void paymentFailed(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pago no completado",
                        "No pudimos confirmar el pago de tu pedido "
                                + orderNumber
                                + ".",
                        "PAYMENT_FAILED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void paymentCancelled(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Pago cancelado",
                        "El pago de tu pedido "
                                + orderNumber
                                + " fue cancelado.",
                        "PAYMENT_CANCELLED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    public void paymentRefunded(
            UUID userId,
            UUID orderId,
            String orderNumber
    ) {
        publish(
                userId,
                new PushMessage(
                        "V\u00c9LORA \u00b7 Reembolso confirmado",
                        "El pago de tu pedido "
                                + orderNumber
                                + " fue reembolsado.",
                        "PAYMENT_REFUNDED",
                        orderId.toString(),
                        ORDERS_ROUTE
                )
        );
    }

    private void publish(
            UUID userId,
            PushMessage message
    ) {
        if (userId == null) {
            return;
        }

        events.publishEvent(
                new CustomerPushEvent(
                        userId,
                        message
                )
        );
    }
}
