-- Ciclo 3:
-- permite pedidos ECOMMERCE originados offline sin debilitar
-- la integridad de los canales existentes.
--
-- ECOMMERCE online:
--   nace de source_cart_id y no utiliza metadatos offline.
--
-- ECOMMERCE offline:
--   no depende del carrito servidor;
--   utiliza client_operation_id, client_created_at y synced_at.
--
-- POS:
--   conserva exactamente su forma operacional existente.

ALTER TABLE orders
    DROP CONSTRAINT ck_orders_channel_shape;


ALTER TABLE orders
    ADD CONSTRAINT ck_orders_channel_shape
        CHECK (
            (
                order_channel = 'ECOMMERCE'
                AND customer_id IS NOT NULL
                AND point_of_sale_id IS NULL
                AND cash_session_id IS NULL
                AND (
                    (
                        source_cart_id IS NOT NULL
                        AND client_operation_id IS NULL
                        AND client_created_at IS NULL
                        AND synced_at IS NULL
                    )
                    OR
                    (
                        source_cart_id IS NULL
                        AND client_operation_id IS NOT NULL
                        AND client_created_at IS NOT NULL
                        AND synced_at IS NOT NULL
                    )
                )
            )
            OR
            (
                order_channel = 'POS'
                AND source_cart_id IS NULL
                AND point_of_sale_id IS NOT NULL
                AND cash_session_id IS NOT NULL
                AND fulfillment_type = 'IN_STORE'
            )
        );
