package com.velora.push;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationService {

    private static final Logger log =
            LoggerFactory.getLogger(
                    PushNotificationService.class
            );

    private final PushInstallationRepository installations;
    private final ObjectProvider<FirebaseMessaging> messagingProvider;

    public PushNotificationService(
            PushInstallationRepository installations,
            ObjectProvider<FirebaseMessaging> messagingProvider
    ) {
        this.installations = installations;
        this.messagingProvider = messagingProvider;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PushDeliverySummary sendToUser(
            UUID userId,
            PushMessage push
    ) {
        List<PushInstallationEntity> targets =
                installations
                        .findAllByUserIdAndActiveTrueOrderByUpdatedAtDesc(
                                userId
                        );

        FirebaseMessaging messaging =
                messagingProvider.getIfAvailable();

        if (messaging == null) {
            log.debug(
                    "Firebase push desactivado; usuario={} instalaciones={}",
                    userId,
                    targets.size()
            );

            return PushDeliverySummary.disabled(
                    targets.size()
            );
        }

        int sent = 0;
        int failed = 0;

        for (
                PushInstallationEntity installation
                : targets
        ) {
            Message message =
                    buildMessage(
                            installation.getInstallationId(),
                            push
                    );

            try {
                messaging.send(message);
                sent++;
            } catch (
                    FirebaseMessagingException exception
            ) {
                failed++;

                if (
                        exception.getMessagingErrorCode()
                                == MessagingErrorCode.UNREGISTERED
                ) {
                    Instant now = Instant.now();

                    installation.setActive(false);
                    installation.setRevokedAt(now);
                    installation.setLastSeenAt(now);

                    log.info(
                            "Push installation auto-revoked; "
                                    + "installation={} platform={} reason=UNREGISTERED",
                            installation.getId(),
                            installation.getPlatform()
                    );
                }

                log.warn(
                        "FCM no pudo entregar push; installation={} error={}",
                        installation.getId(),
                        exception.getMessagingErrorCode()
                );
            }
        }

        return new PushDeliverySummary(
                true,
                targets.size(),
                sent,
                failed
        );
    }

    private Message buildMessage(
            String fid,
            PushMessage push
    ) {
        Message.Builder builder =
                Message.builder()
                        .setFid(fid)
                        .setAndroidConfig(
                                AndroidConfig.builder()
                                        .setPriority(
                                                AndroidConfig.Priority.HIGH
                                        )
                                        .build()
                        )
                        .putData(
                                "title",
                                push.title()
                        )
                        .putData(
                                "body",
                                push.body()
                        )
                        .putData(
                                "type",
                                push.type()
                        );

        if (push.entityId() != null) {
            builder.putData(
                    "entityId",
                    push.entityId()
            );
        }

        if (push.route() != null) {
            builder.putData(
                    "route",
                    push.route()
            );
        }

        return builder.build();
    }
}
