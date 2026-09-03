package com.velora.push;

public record PushMessage(
        String title,
        String body,
        String type,
        String entityId,
        String route
) {

    public PushMessage {
        title = required(
                title,
                "title"
        );
        body = required(
                body,
                "body"
        );
        type = required(
                type,
                "type"
        );
        entityId = optional(entityId);
        route = optional(route);
    }

    private static String required(
            String value,
            String field
    ) {
        if (value == null) {
            throw new IllegalArgumentException(
                    field + " es obligatorio."
            );
        }

        String normalized =
                value.trim();

        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(
                    field + " es obligatorio."
            );
        }

        return normalized;
    }

    private static String optional(
            String value
    ) {
        if (value == null) {
            return null;
        }

        String normalized =
                value.trim();

        return normalized.isEmpty()
                ? null
                : normalized;
    }
}
