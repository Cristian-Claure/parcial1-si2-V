-- Ciclo 3:
-- idempotencia para sincronización de pedidos CUSTOMER offline.
--
-- V12 protegía client_operation_id únicamente dentro del canal POS.
-- Desde V13 cualquier operación cliente no nula debe ser globalmente única,
-- evitando que un mismo UUID pueda representar dos pedidos distintos.

CREATE UNIQUE INDEX uq_orders_client_operation
    ON orders(client_operation_id)
    WHERE client_operation_id IS NOT NULL;


CREATE INDEX idx_orders_ecommerce_offline_sync
    ON orders(
        customer_id,
        synced_at DESC
    )
    WHERE order_channel = 'ECOMMERCE'
      AND client_operation_id IS NOT NULL;
