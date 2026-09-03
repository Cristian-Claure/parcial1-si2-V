package com.velora.report;

import java.math.BigDecimal;
import java.util.List;

public record ReportChart(
        String id,
        String title,
        String type,
        List<String> categories,
        List<Series> series
) {
    public record Series(
            String name,
            List<BigDecimal> data
    ) {}
}