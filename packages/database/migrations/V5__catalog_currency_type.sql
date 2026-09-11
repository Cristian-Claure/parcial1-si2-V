ALTER TABLE product_variants
    ALTER COLUMN currency TYPE VARCHAR(3)
    USING BTRIM(currency);

ALTER TABLE product_variants
    ALTER COLUMN currency SET DEFAULT 'BOB';