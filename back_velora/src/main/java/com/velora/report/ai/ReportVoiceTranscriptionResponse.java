package com.velora.report.ai;

public record ReportVoiceTranscriptionResponse(
        String text,
        String model
) {}