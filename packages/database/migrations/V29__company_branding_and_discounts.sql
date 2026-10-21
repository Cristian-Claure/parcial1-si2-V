-- V29 · Marca por compañía y descuento en pedidos
-- (La cuota del probador usa idx_try_on_jobs_user_created, creado en V20.)
-- Logo y banner reutilizan las claves de ManagedAssetStorageService
-- (mismo formato que product_images.storage_key).

ALTER TABLE companies
    ADD COLUMN display_name VARCHAR(160),
    ADD COLUMN tagline VARCHAR(200),
    ADD COLUMN logo_storage_key VARCHAR(120),
    ADD COLUMN banner_storage_key VARCHAR(120),
    ADD COLUMN brand_palette JSONB,
    ADD COLUMN contact JSONB;

ALTER TABLE companies
    ADD CONSTRAINT ck_companies_logo_storage_key
        CHECK (
            logo_storage_key IS NULL
            OR logo_storage_key ~ '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
        ),
    ADD CONSTRAINT ck_companies_banner_storage_key
        CHECK (
            banner_storage_key IS NULL
            OR banner_storage_key ~ '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
        ),
    ADD CONSTRAINT ck_companies_brand_palette
        CHECK (
            brand_palette IS NULL
            OR jsonb_typeof(brand_palette) = 'object'
        ),
    ADD CONSTRAINT ck_companies_contact
        CHECK (
            contact IS NULL
            OR jsonb_typeof(contact) = 'object'
        );

UPDATE companies
SET display_name = 'VÉLORA',
    brand_palette = '{"primary":"#17130F","accent":"#8B6A34","paper":"#FAF6F0","ink":"#17130F"}'::jsonb
WHERE id = '10000000-0000-0000-0000-000000000001'
  AND brand_palette IS NULL;

ALTER TABLE orders
    ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN discount_reason VARCHAR(120);

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_discount
        CHECK (
            discount_amount >= 0
            AND discount_amount <= subtotal
            AND total = subtotal - discount_amount
        );
