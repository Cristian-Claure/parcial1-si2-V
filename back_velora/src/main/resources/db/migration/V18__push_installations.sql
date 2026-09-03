-- Punto 10 / FCM:
-- registro de instalaciones push por usuario.
--
-- installation_id almacena el Firebase Installation ID (FID)
-- que identifica una instancia registrada con FCM.
--
-- Una misma cuenta puede tener varias instalaciones activas
-- (por ejemplo Android y Web/PWA).

CREATE TABLE push_installations (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES app_users(id)
        ON DELETE CASCADE,

    installation_id VARCHAR(255) NOT NULL,

    platform VARCHAR(20) NOT NULL,

    device_label VARCHAR(160),

    active BOOLEAN NOT NULL DEFAULT TRUE,

    last_seen_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_push_installations_platform
        CHECK (platform IN ('ANDROID', 'WEB')),

    CONSTRAINT uq_push_installations_platform_fid
        UNIQUE (platform, installation_id)
);

CREATE INDEX idx_push_installations_user_active
    ON push_installations(user_id, active);

CREATE INDEX idx_push_installations_last_seen
    ON push_installations(last_seen_at);
