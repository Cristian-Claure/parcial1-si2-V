ALTER TABLE orders
    ADD COLUMN order_channel VARCHAR(20);

UPDATE orders
SET order_channel = 'ECOMMERCE'
WHERE order_channel IS NULL;

ALTER TABLE orders
    ALTER COLUMN order_channel SET NOT NULL;

ALTER TABLE orders
    ADD COLUMN point_of_sale_id UUID
        REFERENCES points_of_sale(id);

ALTER TABLE orders
    ADD COLUMN cash_session_id UUID
        REFERENCES cash_sessions(id);

ALTER TABLE orders
    ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE orders
    ALTER COLUMN source_cart_id DROP NOT NULL;


ALTER TABLE orders
    DROP CONSTRAINT ck_orders_fulfillment_type;

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_fulfillment_type
        CHECK (
            fulfillment_type IN (
                'DELIVERY',
                'PICKUP',
                'IN_STORE'
            )
        );


ALTER TABLE orders
    DROP CONSTRAINT ck_orders_delivery_address;

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_channel
        CHECK (
            order_channel IN (
                'ECOMMERCE',
                'POS'
            )
        );

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_channel_shape
        CHECK (
            (
                order_channel = 'ECOMMERCE'
                AND customer_id IS NOT NULL
                AND source_cart_id IS NOT NULL
                AND point_of_sale_id IS NULL
                AND cash_session_id IS NULL
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

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_fulfillment_address
        CHECK (
            (
                order_channel = 'ECOMMERCE'
                AND fulfillment_type = 'DELIVERY'
                AND address_id IS NOT NULL
                AND recipient_name IS NOT NULL
                AND recipient_phone IS NOT NULL
                AND department IS NOT NULL
                AND city IS NOT NULL
                AND address_line IS NOT NULL
            )
            OR
            (
                order_channel = 'ECOMMERCE'
                AND fulfillment_type = 'PICKUP'
                AND address_id IS NULL
            )
            OR
            (
                order_channel = 'POS'
                AND fulfillment_type = 'IN_STORE'
                AND address_id IS NULL
            )
        );


ALTER TABLE points_of_sale
    ADD CONSTRAINT uq_points_of_sale_id_warehouse
        UNIQUE (id, warehouse_id);

ALTER TABLE cash_sessions
    ADD CONSTRAINT uq_cash_sessions_id_pos
        UNIQUE (id, point_of_sale_id);


ALTER TABLE orders
    ADD CONSTRAINT fk_orders_pos_warehouse
        FOREIGN KEY (
            point_of_sale_id,
            warehouse_id
        )
        REFERENCES points_of_sale(
            id,
            warehouse_id
        );

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_cash_session_pos
        FOREIGN KEY (
            cash_session_id,
            point_of_sale_id
        )
        REFERENCES cash_sessions(
            id,
            point_of_sale_id
        );


CREATE INDEX idx_orders_channel
    ON orders(order_channel);

CREATE INDEX idx_orders_point_of_sale
    ON orders(
        point_of_sale_id,
        created_at DESC
    );

CREATE INDEX idx_orders_cash_session
    ON orders(
        cash_session_id,
        created_at DESC
    );