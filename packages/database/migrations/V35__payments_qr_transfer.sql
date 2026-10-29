-- V35 · Fase 5: pagos por QR, Stripe y transferencia (pedidos y planes)
-- Cambios aditivos sobre payments (V9/V17/V30) y tres tablas nuevas.
--   * TRANSFER: transferencia bancaria (solo pagos de plan).
--   * PENDING_REVIEW: comprobante de transferencia en revisión.
--   * EXPIRED: QR vencido (se evalúa de forma perezosa, sin cron).
-- Ningún pago existente cambia de valor.

ALTER TABLE payments DROP CONSTRAINT ck_payments_method;
ALTER TABLE payments ADD CONSTRAINT ck_payments_method
    CHECK (method IN ('COD', 'CASH', 'CARD', 'WEB', 'QR', 'TRANSFER'));

ALTER TABLE payments DROP CONSTRAINT ck_payments_status;
ALTER TABLE payments ADD CONSTRAINT ck_payments_status
    CHECK (status IN ('PENDING', 'PENDING_REVIEW', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'));

ALTER TABLE payment_status_history DROP CONSTRAINT ck_payment_history_from_status;
ALTER TABLE payment_status_history ADD CONSTRAINT ck_payment_history_from_status
    CHECK (from_status IS NULL OR from_status IN ('PENDING', 'PENDING_REVIEW', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'));
ALTER TABLE payment_status_history DROP CONSTRAINT ck_payment_history_to_status;
ALTER TABLE payment_status_history ADD CONSTRAINT ck_payment_history_to_status
    CHECK (to_status IN ('PENDING', 'PENDING_REVIEW', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'));

-- Plan comprado por un pago de suscripción y referencia de pago (QR numérica o glosa de transferencia).
ALTER TABLE payments
    ADD COLUMN plan_id UUID REFERENCES plans(id) ON DELETE RESTRICT,
    ADD COLUMN payment_reference VARCHAR(24);

ALTER TABLE payments ADD CONSTRAINT ck_payments_plan_target
    CHECK (plan_id IS NULL OR subscription_id IS NOT NULL);
ALTER TABLE payments ADD CONSTRAINT ck_payments_transfer_subscription
    CHECK (method <> 'TRANSFER' OR subscription_id IS NOT NULL);

CREATE UNIQUE INDEX uq_payments_payment_reference
    ON payments(payment_reference)
    WHERE payment_reference IS NOT NULL;

-- Un solo pago de plan abierto por suscripción.
CREATE UNIQUE INDEX uq_payments_open_subscription
    ON payments(subscription_id)
    WHERE subscription_id IS NOT NULL AND status IN ('PENDING', 'PENDING_REVIEW');

CREATE INDEX idx_payments_review_queue
    ON payments(status, created_at DESC)
    WHERE subscription_id IS NOT NULL;

-- Cargos QR: datos del cobro firmado y del token de un solo uso (solo se guarda su hash).
CREATE TABLE qr_charges (
    id UUID PRIMARY KEY,
    payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
    provider VARCHAR(12) NOT NULL,
    reference VARCHAR(24) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    provider_charge_id VARCHAR(120),
    poll_attempts INTEGER NOT NULL DEFAULT 0,
    next_poll_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_qr_charges_provider CHECK (provider IN ('DEMO', 'OPENBCB', 'BCP')),
    CONSTRAINT ck_qr_charges_amount CHECK (amount > 0),
    CONSTRAINT ck_qr_charges_reference CHECK (reference ~ '^[0-9]{8,24}$')
);

CREATE INDEX idx_qr_charges_expires ON qr_charges(expires_at) WHERE consumed_at IS NULL;

-- Datos de cobro de la plataforma (una sola fila). Solo PLATFORM_ADMIN los edita.
CREATE TABLE platform_billing_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    bank_name VARCHAR(120) NOT NULL,
    account_holder VARCHAR(160) NOT NULL,
    account_type VARCHAR(40) NOT NULL,
    account_number VARCHAR(40) NOT NULL,
    tax_id VARCHAR(30),
    instructions VARCHAR(1000),
    qr_storage_key VARCHAR(120),
    is_sample BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_platform_billing_settings_singleton CHECK (id = 1)
);

INSERT INTO platform_billing_settings (id, bank_name, account_holder, account_type, account_number, tax_id, instructions, is_sample, updated_at)
VALUES (
    1,
    'DATOS DE EJEMPLO — reemplazar (Banco Demo)',
    'DATOS DE EJEMPLO — reemplazar (Trama SRL)',
    'Caja de ahorro',
    '0000000000',
    NULL,
    'DATOS DE EJEMPLO — reemplazar. Transfiera el monto exacto e incluya la referencia de pago en la glosa.',
    TRUE,
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Comprobantes de transferencia (archivo privado; nunca se sirve por la ruta pública de assets).
CREATE TABLE payment_transfer_proofs (
    id UUID PRIMARY KEY,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    storage_key VARCHAR(120) NOT NULL UNIQUE,
    content_type VARCHAR(40) NOT NULL,
    size_bytes INTEGER NOT NULL,
    operation_number VARCHAR(60) NOT NULL,
    submitted_by UUID NOT NULL REFERENCES app_users(id),
    submitted_at TIMESTAMPTZ NOT NULL,
    decision VARCHAR(10),
    reviewed_by UUID REFERENCES app_users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason VARCHAR(500),
    CONSTRAINT ck_transfer_proofs_content_type CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
    CONSTRAINT ck_transfer_proofs_size CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    CONSTRAINT ck_transfer_proofs_decision CHECK (decision IS NULL OR decision IN ('APPROVED', 'REJECTED')),
    CONSTRAINT ck_transfer_proofs_rejection CHECK (decision IS DISTINCT FROM 'REJECTED' OR rejection_reason IS NOT NULL)
);

CREATE INDEX idx_transfer_proofs_payment ON payment_transfer_proofs(payment_id, submitted_at DESC);
