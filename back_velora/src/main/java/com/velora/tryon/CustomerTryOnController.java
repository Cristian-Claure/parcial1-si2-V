package com.velora.tryon;

import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/customer/try-on")
public class CustomerTryOnController {

    private final TryOnService tryOnService;

    public CustomerTryOnController(
            TryOnService tryOnService
    ) {
        this.tryOnService = tryOnService;
    }

    @PostMapping(
            value = "/jobs",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    @ResponseStatus(HttpStatus.ACCEPTED)
    public TryOnJobResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam UUID productId,
            @RequestParam(required = false)
            UUID variantId,
            @RequestParam(required = false)
            String provider,
            @RequestParam("person")
            MultipartFile person
    ) {
        return tryOnService.create(
                userId(jwt),
                productId,
                variantId,
                provider,
                person
        );
    }

    @GetMapping("/jobs/{jobId}")
    public TryOnJobResponse get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID jobId
    ) {
        return tryOnService.get(
                userId(jwt),
                jobId
        );
    }

    @DeleteMapping("/jobs/{jobId}")
    public TryOnJobResponse cancel(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID jobId
    ) {
        return tryOnService.cancel(
                userId(jwt),
                jobId
        );
    }

    @GetMapping("/jobs/{jobId}/result")
    public ResponseEntity<Resource> result(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID jobId
    ) {
        TryOnResultStorage.LoadedResult result =
                tryOnService.result(
                        userId(jwt),
                        jobId
                );

        return ResponseEntity.ok()
                .contentType(
                        MediaType.parseMediaType(
                                result.contentType()
                        )
                )
                .contentLength(
                        result.sizeBytes()
                )
                .body(
                        result.resource()
                );
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(
                jwt.getSubject()
        );
    }
}
