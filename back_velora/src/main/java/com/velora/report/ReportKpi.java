package com.velora.report;

import java.math.BigDecimal;

public record ReportKpi(
        String key,
        String label,
        BigDecimal value,
        String format,
        String helper
) {}