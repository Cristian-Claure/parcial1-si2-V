CREATE TABLE points_of_sale (
    id UUID PRIMARY KEY,

    store_id UUID NOT NULL
        REFERENCES stores(id),

    warehouse_id UUID NOT NULL
        REFERENCES warehouses(id),

    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_points_of_sale_store_code
        UNIQUE (store_id, code)
);

CREATE INDEX idx_points_of_sale_store
    ON points_of_sale(store_id);

CREATE INDEX idx_points_of_sale_warehouse
    ON points_of_sale(warehouse_id);

CREATE INDEX idx_points_of_sale_active
    ON points_of_sale(active);


CREATE TABLE cash_sessions (
    id UUID PRIMARY KEY,

    session_number VARCHAR(50) NOT NULL UNIQUE,

    point_of_sale_id UUID NOT NULL
        REFERENCES points_of_sale(id),

    opened_by UUID NOT NULL
        REFERENCES app_users(id),

    closed_by UUID
        REFERENCES app_users(id),

    status VARCHAR(20) NOT NULL,

    currency VARCHAR(3) NOT NULL,

    opening_amount NUMERIC(12,2) NOT NULL,

    expected_cash_amount NUMERIC(12,2),
    counted_cash_amount NUMERIC(12,2),
    cash_difference NUMERIC(12,2),

    opening_notes VARCHAR(500),
    closing_notes VARCHAR(500),

    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT ck_cash_sessions_status
        CHECK (
            status IN (
                'OPEN',
                'CLOSED'
            )
        ),

    CONSTRAINT ck_cash_sessions_opening_amount
        CHECK (
            opening_amount >= 0
        ),

    CONSTRAINT ck_cash_sessions_expected_amount
        CHECK (
            expected_cash_amount IS NULL
            OR expected_cash_amount >= 0
        ),

    CONSTRAINT ck_cash_sessions_counted_amount
        CHECK (
            counted_cash_amount IS NULL
            OR counted_cash_amount >= 0
        ),

    CONSTRAINT ck_cash_sessions_state
        CHECK (
            (
                status = 'OPEN'
                AND closed_by IS NULL
                AND closed_at IS NULL
                AND expected_cash_amount IS NULL
                AND counted_cash_amount IS NULL
                AND cash_difference IS NULL
            )
            OR
            (
                status = 'CLOSED'
                AND closed_by IS NOT NULL
                AND closed_at IS NOT NULL
                AND expected_cash_amount IS NOT NULL
                AND counted_cash_amount IS NOT NULL
                AND cash_difference IS NOT NULL
            )
        )
);

CREATE UNIQUE INDEX uq_cash_sessions_open_pos
    ON cash_sessions(point_of_sale_id)
    WHERE status = 'OPEN';

CREATE INDEX idx_cash_sessions_pos
    ON cash_sessions(
        point_of_sale_id,
        opened_at DESC
    );

CREATE INDEX idx_cash_sessions_opened_by
    ON cash_sessions(
        opened_by,
        opened_at DESC
    );

CREATE INDEX idx_cash_sessions_status
    ON cash_sessions(status);


CREATE TABLE cash_movements (
    id UUID PRIMARY KEY,

    cash_session_id UUID NOT NULL
        REFERENCES cash_sessions(id),

    movement_type VARCHAR(20) NOT NULL,

    amount NUMERIC(12,2) NOT NULL,

    reason VARCHAR(500) NOT NULL,

    created_by UUID NOT NULL
        REFERENCES app_users(id),

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_cash_movements_type
        CHECK (
            movement_type IN (
                'CASH_IN',
                'CASH_OUT'
            )
        ),

    CONSTRAINT ck_cash_movements_amount
        CHECK (
            amount > 0
        )
);

CREATE INDEX idx_cash_movements_session
    ON cash_movements(
        cash_session_id,
        created_at
    );

CREATE INDEX idx_cash_movements_type
    ON cash_movements(movement_type);