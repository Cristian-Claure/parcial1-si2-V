-- V30 · Pagos de suscripción en la misma tabla payments (sin tabla duplicada)
-- Un pago corresponde a un pedido O a una suscripción. Los reportes de ventas
-- ya unen payments con orders (INNER JOIN), así que los pagos de suscripción
-- no se cuentan como ventas.

ALTER TABLE payments
    ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE payments
    ADD COLUMN subscription_id UUID
        REFERENCES subscriptions(id)
        ON DELETE RESTRICT;

ALTER TABLE payments
    ADD CONSTRAINT ck_payments_target
        CHECK ((order_id IS NULL) <> (subscription_id IS NULL));

CREATE INDEX idx_payments_subscription
    ON payments(subscription_id)
    WHERE subscription_id IS NOT NULL;
