CREATE TABLE categories (
    id UUID PRIMARY KEY,
    parent_id UUID REFERENCES categories(id),
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL UNIQUE,
    description VARCHAR(500),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_categories_not_self_parent
        CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_categories_parent_id
    ON categories(parent_id);

CREATE INDEX idx_categories_active
    ON categories(active);


CREATE TABLE products (
    id UUID PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id),
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    brand VARCHAR(120) NOT NULL DEFAULT 'VÉLORA',

    composition VARCHAR(500),
    care_instructions VARCHAR(1000),
    fit_notes VARCHAR(500),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    created_by UUID REFERENCES app_users(id),
    updated_by UUID REFERENCES app_users(id),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_products_status
        CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_products_category_id
    ON products(category_id);

CREATE INDEX idx_products_status
    ON products(status);

CREATE INDEX idx_products_name
    ON products(name);


CREATE TABLE product_variants (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),

    sku VARCHAR(80) NOT NULL UNIQUE,
    barcode VARCHAR(100) UNIQUE,

    size VARCHAR(30) NOT NULL,
    color VARCHAR(80) NOT NULL,
    color_hex VARCHAR(7),

    price NUMERIC(12,2) NOT NULL,
    compare_at_price NUMERIC(12,2),
    currency CHAR(3) NOT NULL DEFAULT 'BOB',

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_product_variant_size_color
        UNIQUE (product_id, size, color),

    CONSTRAINT ck_product_variant_price
        CHECK (price >= 0),

    CONSTRAINT ck_product_variant_compare_price
        CHECK (
            compare_at_price IS NULL
            OR compare_at_price >= price
        ),

    CONSTRAINT ck_product_variant_color_hex
        CHECK (
            color_hex IS NULL
            OR color_hex ~ '^#[0-9A-Fa-f]{6}$'
        )
);

CREATE INDEX idx_product_variants_product_id
    ON product_variants(product_id);

CREATE INDEX idx_product_variants_active
    ON product_variants(active);


CREATE TABLE product_images (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,

    image_url VARCHAR(1000) NOT NULL,
    alt_text VARCHAR(250),

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_product_images_sort_order
        CHECK (sort_order >= 0)
);

CREATE INDEX idx_product_images_product_id
    ON product_images(product_id);

CREATE INDEX idx_product_images_variant_id
    ON product_images(variant_id);