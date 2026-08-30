CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(240),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(120) NOT NULL,
    role VARCHAR(30) NOT NULL,
    customer_type VARCHAR(10),
    status VARCHAR(20) NOT NULL,
    store_id UUID REFERENCES stores(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_app_users_role
        CHECK (role IN ('ADMIN', 'STORE_MANAGER', 'CUSTOMER')),

    CONSTRAINT ck_app_users_status
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),

    CONSTRAINT ck_app_users_customer_type
        CHECK (customer_type IS NULL OR customer_type IN ('B2C', 'B2B')),

    CONSTRAINT ck_store_manager_requires_store
        CHECK (role <> 'STORE_MANAGER' OR store_id IS NOT NULL),

    CONSTRAINT ck_customer_type_by_role
        CHECK (
            (role = 'CUSTOMER' AND customer_type IS NOT NULL)
            OR
            (role <> 'CUSTOMER' AND customer_type IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_store_id ON app_users(store_id);
