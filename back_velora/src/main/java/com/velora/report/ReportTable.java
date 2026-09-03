package com.velora.report;

import java.util.List;

public record ReportTable(
        String id,
        String title,
        List<String> columns,
        List<List<String>> rows
) {}