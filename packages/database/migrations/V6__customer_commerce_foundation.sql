ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(40),
    ADD COLUMN IF NOT EXISTS business_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS tax_id VARCHAR(40);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id),
    label VARCHAR(60) NOT NULL,
    recipient_name VARCHAR(180) NOT NULL,
    recipient_phone VARCHAR(40) NOT NULL,
    department VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    zone VARCHAR(120),
    address_line VARCHAR(240) NOT NULL,
    reference VARCHAR(300),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id
    ON customer_addresses(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_active
    ON customer_addresses(user_id, active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_default_active_address
    ON customer_addresses(user_id)
    WHERE is_default = TRUE AND active = TRUE;