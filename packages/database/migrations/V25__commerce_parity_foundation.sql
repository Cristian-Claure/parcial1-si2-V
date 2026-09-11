-- V25 · Commerce parity foundation
-- Extiende el dominio multi-company sin modificar V1-V24.

ALTER TABLE stores
    ADD CONSTRAINT uq_stores_id_company
        UNIQUE (id, company_id);

ALTER TABLE shopping_carts
    ADD COLUMN company_id UUID,
    ADD COLUMN store_id UUID;

ALTER TABLE shopping_carts
    ADD CONSTRAINT fk_shopping_carts_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE RESTRICT;

ALTER TABLE shopping_carts
    ADD CONSTRAINT fk_shopping_carts_store_company
        FOREIGN KEY (store_id, company_id)
        REFERENCES stores(id, company_id)
        ON DELETE RESTRICT;

ALTER TABLE shopping_carts
    ADD CONSTRAINT ck_shopping_carts_store_requires_company
        CHECK (
            store_id IS NULL
            OR company_id IS NOT NULL
        );

CREATE INDEX idx_shopping_carts_company
    ON shopping_carts(company_id);

CREATE INDEX idx_shopping_carts_store
    ON shopping_carts(store_id);

DROP INDEX uq_shopping_carts_active_user;

CREATE UNIQUE INDEX uq_shopping_carts_active_user_company
    ON shopping_carts(user_id, company_id)
    WHERE status = 'ACTIVE'
      AND company_id IS NOT NULL;

CREATE UNIQUE INDEX uq_shopping_carts_active_user_unscoped
    ON shopping_carts(user_id)
    WHERE status = 'ACTIVE'
      AND company_id IS NULL;

WITH cart_company AS (
    SELECT
        sci.cart_id,
        MIN(p.company_id::text)::uuid AS company_id
    FROM shopping_cart_items sci
    INNER JOIN product_variants pv
        ON pv.id = sci.variant_id
    INNER JOIN products p
        ON p.id = pv.product_id
    GROUP BY sci.cart_id
    HAVING COUNT(DISTINCT p.company_id) = 1
)
UPDATE shopping_carts sc
SET company_id = cc.company_id
FROM cart_company cc
WHERE sc.id = cc.cart_id
  AND sc.company_id IS NULL;

ALTER TABLE orders
    ADD COLUMN idempotency_key_hash VARCHAR(64);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_idempotency_key_hash
        CHECK (
            idempotency_key_hash IS NULL
            OR idempotency_key_hash ~ '^[0-9a-f]{64}$'
        );

CREATE UNIQUE INDEX uq_orders_customer_idempotency_key
    ON orders(customer_id, idempotency_key_hash)
    WHERE order_channel = 'ECOMMERCE'
      AND customer_id IS NOT NULL
      AND idempotency_key_hash IS NOT NULL;

ALTER TABLE order_items
    ADD CONSTRAINT uq_order_items_id_order
        UNIQUE (id, order_id);

CREATE TABLE order_inventory_allocations (
    order_id UUID NOT NULL,
    order_item_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_order_inventory_allocations
        PRIMARY KEY (order_item_id, warehouse_id),

    CONSTRAINT fk_order_inventory_allocations_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_order_inventory_allocations_item_order
        FOREIGN KEY (order_item_id, order_id)
        REFERENCES order_items(id, order_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_order_inventory_allocations_warehouse
        FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_order_inventory_allocations_quantity
        CHECK (quantity > 0)
);

CREATE INDEX idx_order_inventory_allocations_order
    ON order_inventory_allocations(order_id);

CREATE INDEX idx_order_inventory_allocations_warehouse
    ON order_inventory_allocations(warehouse_id);

INSERT INTO order_inventory_allocations (
    order_id,
    order_item_id,
    warehouse_id,
    quantity,
    created_at
)
SELECT
    oi.order_id,
    oi.id,
    o.warehouse_id,
    oi.quantity,
    o.created_at
FROM order_items oi
INNER JOIN orders o
    ON o.id = oi.order_id
ON CONFLICT (order_item_id, warehouse_id) DO NOTHING;
