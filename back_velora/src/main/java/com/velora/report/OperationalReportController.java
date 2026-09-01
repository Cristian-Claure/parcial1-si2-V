package com.velora.report;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({
        "/api/admin/reports",
        "/api/manager/reports"
})
public class OperationalReportController {

    private final OperationalReportService reports;

    public OperationalReportController(
            OperationalReportService reports
    ) {
        this.reports = reports;
    }

    @GetMapping("/overview")
    public ReportOverviewResponse overview(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate to,
            @RequestParam(required = false)
            UUID storeId
    ) {
        return reports.overview(
                UUID.fromString(jwt.getSubject()),
                from,
                to,
                storeId
        );
    }
}