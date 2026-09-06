package com.velora.tryon;

import java.net.http.HttpClient;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TryOnAiClient {

    private final RestClient aiClient;
    private final String internalToken;

    public TryOnAiClient(
            @Value("${velora.ai.base-url}")
            String baseUrl,
            @Value("${velora.ai.internal-token:}")
            String internalToken
    ) {
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .version(
                                HttpClient.Version.HTTP_1_1
                        )
                        .build();

        this.aiClient =
                RestClient.builder()
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

    public FastApiTryOnJob submit(
            TryOnProviderName provider,
            String category,
            byte[] personBytes,
            String personContentType,
            String personFilename,
            byte[] garmentBytes,
            String garmentContentType,
            String garmentFilename
    ) {
        ensureConfigured();

        MultipartBodyBuilder body =
                new MultipartBodyBuilder();

        body.part("provider", provider.wireName());
        body.part("category", category);

        body.part(
                "person",
                namedResource(
                        personBytes,
                        personFilename
                )
        )
        .filename(personFilename)
        .contentType(
                MediaType.parseMediaType(
                        personContentType
                )
        );

        body.part(
                "garment",
                namedResource(
                        garmentBytes,
                        garmentFilename
                )
        )
        .filename(garmentFilename)
        .contentType(
                MediaType.parseMediaType(
                        garmentContentType
                )
        );

        try {
            FastApiTryOnJob response =
                    aiClient
                            .post()
                            .uri("/try-on/jobs")
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .contentType(
                                    MediaType.MULTIPART_FORM_DATA
                            )
                            .body(body.build())
                            .retrieve()
                            .body(FastApiTryOnJob.class);

            return requireResponse(response);
        } catch (RestClientResponseException ex) {
            throw mapAiError(
                    ex,
                    "VÉLORA AI no pudo iniciar "
                    + "el probador virtual."
            );
        } catch (ResourceAccessException ex) {
            throw unavailable(ex);
        }
    }

    public FastApiTryOnJob get(
            TryOnProviderName provider,
            String externalJobId
    ) {
        ensureConfigured();

        try {
            FastApiTryOnJob response =
                    aiClient
                            .get()
                            .uri(
                                    "/try-on/jobs/{provider}/{jobId}",
                                    provider.wireName(),
                                    externalJobId
                            )
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .retrieve()
                            .body(FastApiTryOnJob.class);

            return requireResponse(response);
        } catch (RestClientResponseException ex) {
            throw mapAiError(
                    ex,
                    "VÉLORA AI no pudo consultar "
                    + "el probador virtual."
            );
        } catch (ResourceAccessException ex) {
            throw unavailable(ex);
        }
    }

    public FastApiTryOnJob cancel(
            TryOnProviderName provider,
            String externalJobId
    ) {
        ensureConfigured();

        try {
            FastApiTryOnJob response =
                    aiClient
                            .delete()
                            .uri(
                                    "/try-on/jobs/{provider}/{jobId}",
                                    provider.wireName(),
                                    externalJobId
                            )
                            .header(
                                    "X-Velora-AI-Token",
                                    internalToken
                            )
                            .header(
                                    HttpHeaders.ACCEPT,
                                    MediaType.APPLICATION_JSON_VALUE
                            )
                            .retrieve()
                            .body(FastApiTryOnJob.class);

            return requireResponse(response);
        } catch (RestClientResponseException ex) {
            throw mapAiError(
                    ex,
                    "VÉLORA AI no pudo cancelar "
                    + "el probador virtual."
            );
        } catch (ResourceAccessException ex) {
            throw unavailable(ex);
        }
    }

    private ByteArrayResource namedResource(
            byte[] bytes,
            String filename
    ) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    private FastApiTryOnJob requireResponse(
            FastApiTryOnJob response
    ) {
        if (
                response == null
                || response.provider() == null
                || response.provider().isBlank()
                || response.jobId() == null
                || response.jobId().isBlank()
                || response.status() == null
                || response.status().isBlank()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "VÉLORA AI devolvió un job "
                    + "de probador virtual incompleto."
            );
        }

        return response;
    }

    private void ensureConfigured() {
        if (internalToken.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "VÉLORA AI no está configurado en el backend."
            );
        }
    }

    private ResponseStatusException mapAiError(
            RestClientResponseException ex,
            String fallback
    ) {
        int status = ex.getStatusCode().value();

        if (status == 400) {
            return new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "VÉLORA AI rechazó los datos "
                    + "del probador virtual.",
                    ex
            );
        }

        if (status == 413) {
            return new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Una imagen supera el límite "
                    + "del probador virtual.",
                    ex
            );
        }

        if (status == 503) {
            return new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "El proveedor del probador virtual "
                    + "no está configurado o no está disponible.",
                    ex
            );
        }

        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                fallback,
                ex
        );
    }

    private ResponseStatusException unavailable(
            ResourceAccessException ex
    ) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "El servicio VÉLORA AI no está iniciado.",
                ex
        );
    }

    public record FastApiTryOnJob(
            String provider,
            String jobId,
            String status,
            String resultUrl,
            String error,
            Long durationMs
    ) {}
}
