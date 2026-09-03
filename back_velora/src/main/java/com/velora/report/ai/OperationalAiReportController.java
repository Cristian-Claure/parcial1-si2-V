package com.velora.report.ai;

import java.util.UUID;

import jakarta.validation.Valid;

import org.springframework.http.HttpHeaders;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({
        "/api/admin/reports",
        "/api/manager/reports"
})
public class OperationalAiReportController {

    private final OperationalAiReportService reports;

    public OperationalAiReportController(
            OperationalAiReportService reports
    ) {
        this.reports = reports;
    }

    @PostMapping("/voice-transcribe")
    public ReportVoiceTranscriptionResponse transcribe(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody byte[] audio,
            @RequestHeader(
                    value = HttpHeaders.CONTENT_TYPE,
                    required = false
            )
            String contentType
    ) {
        return reports.transcribeVoice(
                UUID.fromString(jwt.getSubject()),
                audio,
                contentType
        );
    }

    @PostMapping("/ai-query")
    public ReportAiQueryResponse query(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ReportAiQueryRequest request
    ) {
        return reports.query(
                UUID.fromString(jwt.getSubject()),
                request
        );
    }

    @PostMapping("/ai-narrative")
    public ReportAiNarrativeResponse narrative(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ReportAiNarrativeRequest request
    ) {
        return reports.narrative(
                UUID.fromString(jwt.getSubject()),
                request
        );
    }
}