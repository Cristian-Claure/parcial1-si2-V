package com.velora.ai;

import java.net.http.HttpClient;
import java.util.List;
import java.util.Locale;
import java.util.Map;


import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductAssistantService {


    private final RestClient aiClient;
    private final String internalToken;

    public ProductAssistantService(
            @Value("${velora.ai.base-url}") String baseUrl,
            @Value("${velora.ai.internal-token:}") String internalToken
    ) {
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .version(
                                HttpClient.Version.HTTP_1_1
                        )
                        .build();

        this.aiClient = RestClient
                .builder()
                .requestFactory(
                        new JdkClientHttpRequestFactory(
                                httpClient
                        )
                )
                .baseUrl(baseUrl)
                .build();

        this.internalToken =
                internalToken == null
                        ? ""
                        : internalToken.trim();
    }

    public ProductAssistantResponse recommend(
            ProductAssistantRequest request
    ) {
        validate(request);

        if (internalToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "VÉLORA AI no está configurado en el backend."
            );
        }

        List<Map<String, String>> normalizedHistory =
                request.history() == null
                        ? List.of()
                        : request.history()
                                .stream()
                                .filter(item -> item != null)
                                .filter(item -> item.role() != null)
                                .filter(item -> item.content() != null)
                                .map(item -> {
                                    String role =
                                            item.role()
                                                    .trim()
                                                    .toLowerCase(
                                                            Locale.ROOT
                                                    );

                                    String content =
                                            item.content()
                                                    .trim();

                                    if (content.length() > 1200) {
                                        content =
                                                content.substring(
                                                        0,
                                                        1200
                                                );
                                    }

                                    return Map.of(
                                            "role",
                                            role,
                                            "content",
                                            content
                                    );
                                })
                                .filter(item ->
                                        (
                                                "user".equals(
                                                        item.get("role")
                                                )
                                                        || "assistant".equals(
                                                                item.get("role")
                                                        )
                                        )
                                                && !item.get("content").isBlank()
                                )
                                .limit(8)
                                .toList();

        Map<String, Object> payload =
                Map.of(
                        "message",
                        request.message().trim(),
                        "history",
                        normalizedHistory
                );

        try {
            ProductAssistantResponse response =
                    aiClient
                            .post()
                            .uri("/assistant/recommend")
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .contentType(
                                    MediaType.APPLICATION_JSON
                            )
                            .body(payload)
                            .retrieve()
                            .body(
                                    ProductAssistantResponse.class
                            );

            if (response == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "VÉLORA AI devolvió una respuesta vacía."
                );
            }

            return response;
        }
        catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 503) {
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "VÉLORA AI no está configurado o no está disponible.",
                        ex
                );
            }

            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI no pudo completar la recomendación.",
                    ex
            );
        }
        catch (ResourceAccessException ex) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "El servicio VÉLORA AI no está iniciado.",
                    ex
            );
        }
    }

    private void validate(
            ProductAssistantRequest request
    ) {
        if (
                request == null
                        || request.message() == null
                        || request.message().trim().length() < 2
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Escriba al menos dos caracteres para consultar VÉLORA AI."
            );
        }

        if (request.message().length() > 800) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La consulta de VÉLORA AI no puede superar 800 caracteres."
            );
        }

        if (
                request.history() != null
                        && request.history().size() > 8
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El historial de VÉLORA AI no puede superar 8 mensajes."
            );
        }
    }
}