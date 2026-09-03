package com.velora.push;

import java.io.IOException;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(
        prefix = "velora.push.firebase",
        name = "enabled",
        havingValue = "true"
)
public class FirebasePushConfiguration {

    @Bean
    FirebaseApp firebaseApp(
            @Value(
                    "${velora.push.firebase.project-id:}"
            )
            String projectId
    ) throws IOException {
        if (!FirebaseApp.getApps().isEmpty()) {
            return FirebaseApp.getInstance();
        }

        FirebaseOptions.Builder options =
                FirebaseOptions.builder()
                        .setCredentials(
                                GoogleCredentials
                                        .getApplicationDefault()
                        );

        if (
                projectId != null &&
                !projectId.isBlank()
        ) {
            options.setProjectId(
                    projectId.trim()
            );
        }

        return FirebaseApp.initializeApp(
                options.build()
        );
    }

    @Bean
    FirebaseMessaging firebaseMessaging(
            FirebaseApp firebaseApp
    ) {
        return FirebaseMessaging.getInstance(
                firebaseApp
        );
    }
}
