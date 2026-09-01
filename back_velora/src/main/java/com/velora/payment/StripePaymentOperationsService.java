package com.velora.payment;

import com.stripe.exception.StripeException;
import com.stripe.model.Refund;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.checkout.SessionExpireParams;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripePaymentOperationsService {

    private final String secretKey;

    public StripePaymentOperationsService(
            @Value("${velora.stripe.secret-key:}")
            String secretKey
    ) {
        this.secretKey =
                secretKey == null
                        ? ""
                        : secretKey.trim();
    }

    public boolean supports(
            PaymentEntity payment
    ) {
        return payment != null
                && StripePaymentService.PROVIDER
                        .equalsIgnoreCase(
                                payment.getProvider()
                        )
                && payment.getExternalReference()
                        != null
                && !payment.getExternalReference()
                        .isBlank();
    }

    public void expirePendingCheckoutIfNeeded(
            PaymentEntity payment
    ) {
        if (!supports(payment)) {
            return;
        }

        requireConfigured();

        String sessionId =
                requireSessionId(payment);

        try {
            Session session =
                    Session.retrieve(
                            sessionId,
                            readOptions()
                    );

            String status =
                    normalize(
                            session.getStatus()
                    );

            if ("expired".equals(status)) {
                return;
            }

            if ("open".equals(status)) {
                Session expired =
                        session.expire(
                                SessionExpireParams
                                        .builder()
                                        .build(),
                                mutationOptions(
                                        "velora-expire-"
                                                + payment.getId()
                                )
                        );

                if (!"expired".equals(
                        normalize(
                                expired.getStatus()
                        )
                )) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY,
                            "Stripe no confirmó la expiración de la sesión de pago."
                    );
                }

                return;
            }

            if ("complete".equals(status)
                    && "paid".equals(
                            normalize(
                                    session.getPaymentStatus()
                            )
                    )) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stripe ya confirmó este pago. Espere la actualización automática antes de cancelarlo."
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La sesión de Stripe ya no puede cancelarse de forma segura."
            );
        }
        catch (StripeException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "No fue posible cancelar la sesión de pago en Stripe.",
                    ex
            );
        }
    }

    public String refundPaidPaymentIfNeeded(
            PaymentEntity payment
    ) {
        if (!supports(payment)) {
            return null;
        }

        requireConfigured();

        String sessionId =
                requireSessionId(payment);

        try {
            Session session =
                    Session.retrieve(
                            sessionId,
                            readOptions()
                    );

            if (!"complete".equals(
                    normalize(session.getStatus())
            ) || !"paid".equals(
                    normalize(
                            session.getPaymentStatus()
                    )
            )) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stripe no confirma un cobro completado para este pago."
                );
            }

            String paymentIntentId =
                    session.getPaymentIntent();

            if (paymentIntentId == null
                    || paymentIntentId.isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Stripe no devolvió el PaymentIntent necesario para el reembolso."
                );
            }

            RefundCreateParams params =
                    RefundCreateParams
                            .builder()
                            .setPaymentIntent(
                                    paymentIntentId
                            )
                            .setReason(
                                    RefundCreateParams
                                            .Reason
                                            .REQUESTED_BY_CUSTOMER
                            )
                            .putMetadata(
                                    "velora_payment_id",
                                    payment.getId()
                                            .toString()
                            )
                            .putMetadata(
                                    "velora_order_id",
                                    payment.getOrder()
                                            .getId()
                                            .toString()
                            )
                            .build();

            Refund refund =
                    Refund.create(
                            params,
                            mutationOptions(
                                    "velora-refund-"
                                            + payment.getId()
                            )
                    );

            if (refund.getId() == null
                    || refund.getId().isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Stripe no devolvió una referencia de reembolso válida."
                );
            }

            if (!"succeeded".equals(
                    normalize(refund.getStatus())
            )) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Stripe recibió el reembolso pero todavía no lo confirmó como completado. VÉLORA mantendrá el pago como pagado hasta una confirmación definitiva."
                );
            }

            return refund.getId();
        }
        catch (StripeException ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "No fue posible completar el reembolso en Stripe.",
                    ex
            );
        }
    }

    private String requireSessionId(
            PaymentEntity payment
    ) {
        String sessionId =
                payment.getExternalReference();

        if (sessionId == null
                || !sessionId.startsWith("cs_")) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pago Stripe no tiene una Checkout Session válida."
            );
        }

        return sessionId;
    }

    private void requireConfigured() {
        if (secretKey.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "STRIPE_SECRET_KEY no está configurado."
            );
        }
    }

    private RequestOptions readOptions() {
        return RequestOptions
                .builder()
                .setApiKey(secretKey)
                .setMaxNetworkRetries(2)
                .build();
    }

    private RequestOptions mutationOptions(
            String idempotencyKey
    ) {
        return RequestOptions
                .builder()
                .setApiKey(secretKey)
                .setIdempotencyKey(
                        idempotencyKey
                )
                .setMaxNetworkRetries(2)
                .build();
    }

    private String normalize(
            String value
    ) {
        return value == null
                ? ""
                : value.trim()
                        .toLowerCase(
                                java.util.Locale.ROOT
                        );
    }
}