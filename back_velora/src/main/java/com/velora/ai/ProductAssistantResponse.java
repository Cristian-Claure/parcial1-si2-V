package com.velora.ai;

import java.util.List;

public record ProductAssistantResponse(
        String reply,
        List<Recommendation> recommendations,
        String model
) {

    public record Recommendation(
            String productId,
            String reason,
            List<String> variantIds
    ) {}
}