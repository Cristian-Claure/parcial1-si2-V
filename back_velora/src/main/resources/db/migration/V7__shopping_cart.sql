CREATE TABLE IF NOT EXISTS shopping_carts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id),
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_shopping_carts_status
        CHECK (status IN ('ACTIVE', 'CONVERTED', 'ABANDONED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_carts_active_user
    ON shopping_carts(user_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_shopping_carts_user
    ON shopping_carts(user_id);

CREATE TABLE IF NOT EXISTS shopping_cart_items (
    id UUID PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_shopping_cart_items_quantity
        CHECK (quantity > 0),

    CONSTRAINT uq_shopping_cart_item_variant
        UNIQUE (cart_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_cart
    ON shopping_cart_items(cart_id);

CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_variant
    ON shopping_cart_items(variant_id);