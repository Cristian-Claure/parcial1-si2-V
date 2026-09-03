package com.velora.report.ai;

import java.time.LocalDate;
import java.util.UUID;

import com.velora.report.ReportOverviewResponse;

public record ReportAiQueryResponse(
        String question,
        Intent intent,
        ReportOverviewResponse report,
        ReportAiNarrativeResponse narrative,
        String model
) {
    public record Intent(
            String focus,
            LocalDate fromDate,
            LocalDate toDate,
            UUID storeId,
            String requestedChart
    ) {}
}