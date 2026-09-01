package com.velora.ai;

import java.util.List;

public record ProductAssistantRequest(
        String message,
        List<HistoryItem> history
) {

    public record HistoryItem(
            String role,
            String content
    ) {}
}