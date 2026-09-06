ALTER TABLE products
    ADD COLUMN try_on_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN try_on_category VARCHAR(30);

ALTER TABLE products
    ADD CONSTRAINT ck_products_try_on_category
        CHECK (
            try_on_category IS NULL
            OR try_on_category IN (
                'TOP', 'BOTTOM', 'DRESS', 'OUTERWEAR', 'SHOES', 'ACCESSORY'
            )
        ),
    ADD CONSTRAINT ck_products_try_on_enabled_category
        CHECK (
            try_on_enabled = FALSE
            OR try_on_category IS NOT NULL
        );

ALTER TABLE product_images
    ADD COLUMN purpose VARCHAR(30) NOT NULL DEFAULT 'GALLERY';

ALTER TABLE product_images
    ADD CONSTRAINT ck_product_images_purpose
        CHECK (purpose IN ('GALLERY', 'TRY_ON_GARMENT'));

CREATE INDEX idx_product_images_try_on
    ON product_images (product_id, purpose, variant_id, sort_order);
