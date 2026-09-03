package com.velora.payment;

import com.velora.push.CustomerPushEventPublisher;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import com.velora.payment.dto.CreatePaymentRequest;
import com.velora.payment.dto.PaymentResponse;
import com.velora.payment.dto.StripeCheckoutResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripePaymentService {

    public static final String PROVIDER = "STRIPE";

    private final PaymentService paymentService;
    private final PaymentRepository payments;
    private final PaymentStatusHistoryRepository history;
    private final CustomerPushEventPublisher customerPush;
    private final String secretKey;
    private final String webhookSecret;
    private final String successUrl;
    private final String cancelUrl;

    public StripePaymentService(
            PaymentService paymentService,
            PaymentRepository payments,
            PaymentStatusHistoryRepository history,
            CustomerPushEventPublisher customerPush,
            @Value("${velora.stripe.secret-key:}") String secretKey,
            @Value("${velora.stripe.webhook-secret:}") String webhookSecret,
            @Value("${velora.stripe.success-url}") String successUrl,
            @Value("${velora.stripe.cancel-url}") String cancelUrl
    ) {
        this.paymentService = paymentService;
        this.payments = payments;
        this.history = history;
        this.customerPush = customerPush;
        this.secretKey = secretKey == null ? "" : secretKey.trim();
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret.trim();
        this.successUrl = successUrl;
        this.cancelUrl = cancelUrl;
    }

    @Transactional
    public StripeCheckoutResponse createCheckout(
            UUID customerId,
            UUID orderId
    ) {
        requireConfigured();

        PaymentResponse created =
                paymentService.create(
                        customerId,
                        orderId,
                        new CreatePaymentRequest(
                                PaymentMethod.WEB,
                                "Pago online mediante Stripe Checkout."
                        )
                );

        PaymentEntity payment = payments
                .findForUpdateById(created.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago no encontrado."
                ));

        Stripe.apiKey = secretKey;

        String currency =
                payment.getCurrency()
                        .toLowerCase(Locale.ROOT);

        long unitAmount =
                toMinorUnits(payment.getAmount());

        String success =
                successUrl
                        + "?session_id={CHECKOUT_SESSION_ID}"
                        + "&payment_id="
                        + payment.getId();

        SessionCreateParams params =
                SessionCreateParams.builder()
                        .setMode(
                                SessionCreateParams.Mode.PAYMENT
                        )
                        .setSuccessUrl(success)
                        .setCancelUrl(cancelUrl)
                        .setClientReferenceId(
                                payment.getId().toString()
                        )
                        .putMetadata(
                                "velora_payment_id",
                                payment.getId().toString()
                        )
                        .putMetadata(
                                "velora_order_id",
                                payment.getOrder()
                                        .getId()
                                        .toString()
                        )
                        .setPaymentIntentData(
                                SessionCreateParams.PaymentIntentData
                                        .builder()
                                        .putMetadata(
                                                "velora_payment_id",
                                                payment.getId().toString()
                                        )
                                        .putMetadata(
                                                "velora_order_id",
                                                payment.getOrder()
                                                        .getId()
                                                        .toString()
                                        )
                                        .build()
                        )
                        .addLineItem(
                                SessionCreateParams.LineItem
                                        .builder()
                                        .setQuantity(1L)
                                        .setPriceData(
                                                SessionCreateParams.LineItem.PriceData
                                                        .builder()
                                                        .setCurrency(currency)
                                                        .setUnitAmount(unitAmount)
                                                        .setProductData(
                                                                SessionCreateParams.LineItem.PriceData.ProductData
                                                                        .builder()
                                                                        .setName(
                                                                                "Pedido "
                                                                                        + payment.getOrder()
                                                                                                .getOrderNumber()
                                                                        )
                                                                        .setDescription(
                                                                                "Compra VÉLORA · "
                                                                                        + payment.getOrder()
                                                                                                .getWarehouse()
                                                                                                .getStore()
                                                                                                .getName()
                                                                        )
                                                                        .build()
                                                        )
                                                        .build()
                                        )
                                        .build()
                        )
                        .build();

        try {
            Session session =
                    Session.create(params);

            if (
                    session.getId() == null
                            || session.getUrl() == null
            ) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Stripe no devolvió una sesión de pago válida."
                );
            }

            payment.setProvider(PROVIDER);
            payment.setExternalReference(
                    session.getId()
            );
            payments.saveAndFlush(payment);

            Instant expiresAt =
                    session.getExpiresAt() == null
                            ? null
                            : Instant.ofEpochSecond(
                                    session.getExpiresAt()
                            );

            return new StripeCheckoutResponse(
                    PaymentResponse.from(payment),
                    session.getUrl(),
                    session.getId(),
                    expiresAt
            );
        }
        catch (StripeException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "No fue posible iniciar el pago seguro con Stripe.",
                    ex
            );
        }
    }

    @Transactional
    public void handleWebhook(
            String payload,
            String signature
    ) {
        if (webhookSecret.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STRIPE_WEBHOOK_SECRET no está configurado."
            );
        }

        final Event event;

        try {
            event = Webhook.constructEvent(
                    payload,
                    signature,
                    webhookSecret
            );
        }
        catch (Exception ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Firma de webhook Stripe inválida.",
                    ex
            );
        }

        Object object =
                event.getDataObjectDeserializer()
                        .getObject()
                        .orElse(null);

        if (!(object instanceof Session session)) {
            return;
        }

        switch (event.getType()) {
                        case "checkout.session.completed" -> {
                if ("paid".equalsIgnoreCase(
                        session.getPaymentStatus()
                )) {
                    markPaid(session);
                }
            }

            case "checkout.session.async_payment_succeeded" ->
                    markPaid(session);

            case "checkout.session.expired",
                 "checkout.session.async_payment_failed" ->
                    markFailed(session);

            default -> {
                // Evento Stripe no relevante para el dominio de VÉLORA.
            }
        }
    }

    private void markPaid(Session session) {
        PaymentEntity payment =
                findPayment(session.getId());

        if (payment.getStatus() == PaymentStatus.PAID) {
            return;
        }

        if (payment.getStatus() != PaymentStatus.PENDING) {
            return;
        }

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(PaymentStatus.PAID);
        payment.setProcessedBy(
                payment.getCreatedBy()
        );
        payment.setPaidAt(Instant.now());
        payments.saveAndFlush(payment);

        registerHistory(
                payment,
                previous,
                PaymentStatus.PAID,
                "Pago confirmado por webhook firmado de Stripe."
        );

        if (
                payment.getOrder().getOrderChannel()
                        == com.velora.order.OrderChannel.ECOMMERCE
                && payment.getOrder().getCustomer() != null
        ) {
            customerPush.paymentConfirmed(
                    payment.getOrder().getCustomer().getId(),
                    payment.getOrder().getId(),
                    payment.getOrder().getOrderNumber()
            );
        }
}

    private void markFailed(Session session) {
        PaymentEntity payment =
                findPayment(session.getId());

        if (payment.getStatus() != PaymentStatus.PENDING) {
            return;
        }

        PaymentStatus previous =
                payment.getStatus();

        payment.setStatus(PaymentStatus.FAILED);
        payment.setProcessedBy(
                payment.getCreatedBy()
        );
        payment.setFailedAt(Instant.now());
        payments.saveAndFlush(payment);

        registerHistory(
                payment,
                previous,
                PaymentStatus.FAILED,
                "Stripe informó que la sesión expiró o el pago asíncrono falló."
        );

        if (
                payment.getOrder().getOrderChannel()
                        == com.velora.order.OrderChannel.ECOMMERCE
                && payment.getOrder().getCustomer() != null
        ) {
            customerPush.paymentFailed(
                    payment.getOrder().getCustomer().getId(),
                    payment.getOrder().getId(),
                    payment.getOrder().getOrderNumber()
            );
        }
}

    private PaymentEntity findPayment(
            String sessionId
    ) {
        return payments
                .findForUpdateByProviderAndExternalReference(
                        PROVIDER,
                        sessionId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pago Stripe no encontrado."
                ));
    }

    private void registerHistory(
            PaymentEntity payment,
            PaymentStatus from,
            PaymentStatus to,
            String reason
    ) {
        PaymentStatusHistoryEntity entry =
                new PaymentStatusHistoryEntity();

        entry.setPayment(payment);
        entry.setFromStatus(from);
        entry.setToStatus(to);
        entry.setChangedBy(
                payment.getCreatedBy()
        );
        entry.setReason(reason);

        history.saveAndFlush(entry);
    }

    private long toMinorUnits(
            BigDecimal amount
    ) {
        try {
            return amount
                    .setScale(
                            2,
                            RoundingMode.UNNECESSARY
                    )
                    .movePointRight(2)
                    .longValueExact();
        }
        catch (ArithmeticException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El importe del pedido no puede convertirse a unidades monetarias Stripe.",
                    ex
            );
        }
    }

    private void requireConfigured() {
        if (secretKey.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STRIPE_SECRET_KEY no está configurado."
            );
        }
    }
}
