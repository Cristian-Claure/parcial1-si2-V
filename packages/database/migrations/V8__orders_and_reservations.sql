CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    order_number VARCHAR(40) NOT NULL UNIQUE,

    customer_id UUID NOT NULL REFERENCES app_users(id),
    source_cart_id UUID NOT NULL UNIQUE REFERENCES shopping_carts(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    address_id UUID REFERENCES customer_addresses(id),

    fulfillment_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,

    currency VARCHAR(3) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    total NUMERIC(12,2) NOT NULL,

    recipient_name VARCHAR(180),
    recipient_phone VARCHAR(40),
    department VARCHAR(100),
    city VARCHAR(100),
    zone VARCHAR(120),
    address_line VARCHAR(240),
    address_reference VARCHAR(300),

    notes VARCHAR(500),

    cancelled_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_orders_fulfillment_type
        CHECK (fulfillment_type IN ('DELIVERY', 'PICKUP')),

    CONSTRAINT ck_orders_status
        CHECK (status IN ('RESERVED', 'CANCELLED', 'FULFILLED')),

    CONSTRAINT ck_orders_totals
        CHECK (
            subtotal >= 0
            AND total >= 0
        ),

    CONSTRAINT ck_orders_delivery_address
        CHECK (
            (
                fulfillment_type = 'DELIVERY'
                AND address_id IS NOT NULL
                AND recipient_name IS NOT NULL
                AND recipient_phone IS NOT NULL
                AND department IS NOT NULL
                AND city IS NOT NULL
                AND address_line IS NOT NULL
            )
            OR
            (
                fulfillment_type = 'PICKUP'
                AND address_id IS NULL
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_orders_customer
    ON orders(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_warehouse
    ON orders(warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),

    product_name VARCHAR(180) NOT NULL,
    sku VARCHAR(80) NOT NULL,
    size VARCHAR(30) NOT NULL,
    color VARCHAR(80) NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_order_item_variant
        UNIQUE (order_id, variant_id),

    CONSTRAINT ck_order_items_quantity
        CHECK (quantity > 0),

    CONSTRAINT ck_order_items_amounts
        CHECK (
            unit_price >= 0
            AND subtotal >= 0
        )
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
    ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant
    ON order_items(variant_id);