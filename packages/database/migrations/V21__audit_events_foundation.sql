CREATE TABLE audit_events (
    id UUID PRIMARY KEY,

    occurred_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    actor_user_id UUID,
    actor_email VARCHAR(254),
    actor_name VARCHAR(200),
    actor_role VARCHAR(32) NOT NULL,

    category VARCHAR(48) NOT NULL,
    http_method VARCHAR(8) NOT NULL,
    route_pattern VARCHAR(512) NOT NULL,
    request_path VARCHAR(512) NOT NULL,

    status_code INTEGER NOT NULL,
    success BOOLEAN NOT NULL,

    request_id VARCHAR(128),

    CONSTRAINT ck_audit_events_http_method
        CHECK (
            http_method IN (
                'POST',
                'PUT',
                'PATCH',
                'DELETE'
            )
        ),

    CONSTRAINT ck_audit_events_status_code
        CHECK (
            status_code >= 100
            AND status_code <= 599
        )
);

CREATE INDEX idx_audit_events_occurred_at
    ON audit_events(occurred_at DESC);

CREATE INDEX idx_audit_events_actor
    ON audit_events(actor_user_id, occurred_at DESC);

CREATE INDEX idx_audit_events_category
    ON audit_events(category, occurred_at DESC);

CREATE INDEX idx_audit_events_route
    ON audit_events(route_pattern, occurred_at DESC);
