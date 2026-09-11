CREATE TABLE customer_favorites (
    id UUID PRIMARY KEY,

    customer_id UUID NOT NULL
        REFERENCES app_users(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_customer_favorites_customer_product
        UNIQUE (customer_id, product_id)
);

CREATE INDEX idx_customer_favorites_customer
    ON customer_favorites(customer_id);

CREATE INDEX idx_customer_favorites_product
    ON customer_favorites(product_id);