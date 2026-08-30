ALTER TABLE orders
    ADD COLUMN client_operation_id UUID;

ALTER TABLE orders
    ADD COLUMN client_created_at TIMESTAMPTZ;

ALTER TABLE orders
    ADD COLUMN synced_at TIMESTAMPTZ;


UPDATE orders
SET client_operation_id = id
WHERE order_channel = 'POS'
  AND client_operation_id IS NULL;


ALTER TABLE orders
    ADD CONSTRAINT ck_orders_pos_client_operation
        CHECK (
            (
                order_channel = 'POS'
                AND client_operation_id IS NOT NULL
            )
            OR
            (
                order_channel = 'ECOMMERCE'
            )
        );


CREATE UNIQUE INDEX uq_orders_pos_client_operation
    ON orders(client_operation_id)
    WHERE order_channel = 'POS';


CREATE INDEX idx_orders_pos_sync
    ON orders(
        point_of_sale_id,
        synced_at DESC
    )
    WHERE order_channel = 'POS';