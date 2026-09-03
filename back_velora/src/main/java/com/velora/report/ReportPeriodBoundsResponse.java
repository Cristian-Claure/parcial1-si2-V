package com.velora.report;

import java.time.LocalDate;

public record ReportPeriodBoundsResponse(
        LocalDate minDate,
        LocalDate maxDate
) {}
