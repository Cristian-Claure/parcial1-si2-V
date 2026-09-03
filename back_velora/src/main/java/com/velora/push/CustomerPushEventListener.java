package com.velora.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CustomerPushEventListener {

    private static final Logger log =
            LoggerFactory.getLogger(
                    CustomerPushEventListener.class
            );

    private final PushNotificationService push;

    public CustomerPushEventListener(
            PushNotificationService push
    ) {
        this.push = push;
    }

    @TransactionalEventListener(
            phase = TransactionPhase.AFTER_COMMIT
    )
    public void afterCommit(
            CustomerPushEvent event
    ) {
        try {
            PushDeliverySummary summary =
                    push.sendToUser(
                            event.userId(),
                            event.message()
                    );

            log.info(
                    "Customer push after commit; user={} "
                            + "type={} registered={} sent={} failed={}",
                    event.userId(),
                    event.message().type(),
                    summary.registeredInstallations(),
                    summary.sent(),
                    summary.failed()
            );
        }
        catch (RuntimeException exception) {
            /*
             * La operacion de negocio ya hizo commit.
             * Un fallo de entrega push nunca debe convertir
             * una compra/pago exitoso en un HTTP 500.
             */
            log.warn(
                    "Customer push after commit fallo; user={} type={}",
                    event.userId(),
                    event.message().type(),
                    exception
            );
        }
    }
}
