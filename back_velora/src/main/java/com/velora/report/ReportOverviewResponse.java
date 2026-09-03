package com.velora.report;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record ReportOverviewResponse(
        String title,
        String scopeLabel,
        LocalDate from,
        LocalDate to,
        Instant generatedAt,
        List<ReportKpi> kpis,
        List<ReportChart> charts,
        List<ReportTable> tables,
        List<String> deterministicInsights
) {}