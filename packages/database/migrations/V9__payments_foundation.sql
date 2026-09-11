CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,

    order_id UUID NOT NULL REFERENCES orders(id),

    method VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,

    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,

    provider VARCHAR(80),
    external_reference VARCHAR(160),
    notes VARCHAR(500),

    created_by UUID NOT NULL REFERENCES app_users(id),
    processed_by UUID REFERENCES app_users(id),

    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_payments_method
        CHECK (
            method IN (
                'COD',
                'CASH',
                'CARD',
                'WEB',
                'QR'
            )
        ),

    CONSTRAINT ck_payments_status
        CHECK (
            status IN (
                'PENDING',
                'PAID',
                'FAILED',
                'CANCELLED',
                'REFUNDED'
            )
        ),

    CONSTRAINT ck_payments_amount
        CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payments_order
    ON payments(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_method
    ON payments(method);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_pending_order
    ON payments(order_id)
    WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paid_order
    ON payments(order_id)
    WHERE status = 'PAID';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_reference
    ON payments(provider, external_reference)
    WHERE provider IS NOT NULL
      AND external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_status_history (
    id UUID PRIMARY KEY,

    payment_id UUID NOT NULL
        REFERENCES payments(id)
        ON DELETE CASCADE,

    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,

    changed_by UUID NOT NULL
        REFERENCES app_users(id),

    reason VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_payment_history_from_status
        CHECK (
            from_status IS NULL
            OR from_status IN (
                'PENDING',
                'PAID',
                'FAILED',
                'CANCELLED',
                'REFUNDED'
            )
        ),

    CONSTRAINT ck_payment_history_to_status
        CHECK (
            to_status IN (
                'PENDING',
                'PAID',
                'FAILED',
                'CANCELLED',
                'REFUNDED'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_payment_history_payment
    ON payment_status_history(
        payment_id,
        created_at
    );