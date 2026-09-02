package com.velora.report.ai;

import java.util.List;

public record ReportAiNarrativeResponse(
        String summary,
        List<String> insights,
        String model
) {}