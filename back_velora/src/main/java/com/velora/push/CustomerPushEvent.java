package com.velora.push;

import java.util.UUID;

public record CustomerPushEvent(
        UUID userId,
        PushMessage message
) {
}
