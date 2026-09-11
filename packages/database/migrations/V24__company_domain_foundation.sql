CREATE TABLE companies (
    id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(500),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_companies_active
    ON companies(active);

INSERT INTO companies (
    id,
    code,
    name,
    description,
    active,
    created_at,
    updated_at
)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'VELORA',
    'VÉLORA',
    'Compañía principal migrada desde el esquema histórico V1-V23.',
    TRUE,
    NOW(),
    NOW()
);

ALTER TABLE stores
    ADD COLUMN company_id UUID;

UPDATE stores
SET company_id = '10000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE stores
    ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE stores
    ADD CONSTRAINT fk_stores_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE RESTRICT;

ALTER TABLE stores
    DROP CONSTRAINT stores_code_key;

ALTER TABLE stores
    ADD CONSTRAINT uq_stores_company_code
        UNIQUE (company_id, code);

CREATE INDEX idx_stores_company_id
    ON stores(company_id);

ALTER TABLE categories
    ADD COLUMN company_id UUID;

UPDATE categories
SET company_id = '10000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE categories
    ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE categories
    ADD CONSTRAINT fk_categories_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE RESTRICT;

ALTER TABLE categories
    DROP CONSTRAINT categories_parent_id_fkey;

ALTER TABLE categories
    DROP CONSTRAINT categories_slug_key;

ALTER TABLE categories
    ADD CONSTRAINT uq_categories_company_id_id
        UNIQUE (company_id, id);

ALTER TABLE categories
    ADD CONSTRAINT uq_categories_company_slug
        UNIQUE (company_id, slug);

ALTER TABLE categories
    ADD CONSTRAINT fk_categories_company_parent
        FOREIGN KEY (company_id, parent_id)
        REFERENCES categories(company_id, id);

CREATE INDEX idx_categories_company_id
    ON categories(company_id);

ALTER TABLE products
    ADD COLUMN company_id UUID;

UPDATE products
SET company_id = '10000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE products
    ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE products
    ADD CONSTRAINT fk_products_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE RESTRICT;

ALTER TABLE products
    DROP CONSTRAINT products_category_id_fkey;

ALTER TABLE products
    DROP CONSTRAINT products_slug_key;

ALTER TABLE products
    ADD CONSTRAINT uq_products_company_slug
        UNIQUE (company_id, slug);

ALTER TABLE products
    ADD CONSTRAINT fk_products_company_category
        FOREIGN KEY (company_id, category_id)
        REFERENCES categories(company_id, id);

CREATE INDEX idx_products_company_id
    ON products(company_id);
