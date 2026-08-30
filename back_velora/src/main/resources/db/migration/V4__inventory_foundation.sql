CREATE TABLE warehouses (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id),

    code VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500),

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_warehouses_store_code
        UNIQUE (store_id, code)
);

CREATE INDEX idx_warehouses_store_id
    ON warehouses(store_id);

CREATE INDEX idx_warehouses_active
    ON warehouses(active);


CREATE TABLE inventory_stocks (
    id UUID PRIMARY KEY,

    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    variant_id UUID NOT NULL REFERENCES product_variants(id),

    physical_quantity INTEGER NOT NULL DEFAULT 0,
    committed_quantity INTEGER NOT NULL DEFAULT 0,

    available_quantity INTEGER
        GENERATED ALWAYS AS (
            physical_quantity - committed_quantity
        ) STORED,

    version BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_inventory_stock
        UNIQUE (warehouse_id, variant_id),

    CONSTRAINT ck_inventory_physical_non_negative
        CHECK (physical_quantity >= 0),

    CONSTRAINT ck_inventory_committed_non_negative
        CHECK (committed_quantity >= 0),

    CONSTRAINT ck_inventory_committed_not_over_physical
        CHECK (committed_quantity <= physical_quantity)
);

CREATE INDEX idx_inventory_stocks_warehouse_id
    ON inventory_stocks(warehouse_id);

CREATE INDEX idx_inventory_stocks_variant_id
    ON inventory_stocks(variant_id);


CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY,

    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    variant_id UUID NOT NULL REFERENCES product_variants(id),

    movement_type VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL,

    physical_delta INTEGER NOT NULL DEFAULT 0,
    committed_delta INTEGER NOT NULL DEFAULT 0,

    physical_before INTEGER NOT NULL,
    physical_after INTEGER NOT NULL,

    committed_before INTEGER NOT NULL,
    committed_after INTEGER NOT NULL,

    reference_type VARCHAR(40),
    reference_id UUID,

    reason VARCHAR(500),

    performed_by UUID REFERENCES app_users(id),

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_inventory_movement_type
        CHECK (
            movement_type IN (
                'ENTRY',
                'ADJUSTMENT_IN',
                'ADJUSTMENT_OUT',
                'RESERVE',
                'RELEASE',
                'SALE',
                'RETURN',
                'TRANSFER_IN',
                'TRANSFER_OUT'
            )
        ),

    CONSTRAINT ck_inventory_movement_quantity
        CHECK (quantity > 0),

    CONSTRAINT ck_inventory_movement_has_delta
        CHECK (
            physical_delta <> 0
            OR committed_delta <> 0
        ),

    CONSTRAINT ck_inventory_physical_result
        CHECK (
            physical_after =
            physical_before + physical_delta
        ),

    CONSTRAINT ck_inventory_committed_result
        CHECK (
            committed_after =
            committed_before + committed_delta
        ),

    CONSTRAINT ck_inventory_movement_before
        CHECK (
            physical_before >= 0
            AND committed_before >= 0
            AND committed_before <= physical_before
        ),

    CONSTRAINT ck_inventory_movement_after
        CHECK (
            physical_after >= 0
            AND committed_after >= 0
            AND committed_after <= physical_after
        )
);

CREATE INDEX idx_inventory_movements_warehouse_id
    ON inventory_movements(warehouse_id);

CREATE INDEX idx_inventory_movements_variant_id
    ON inventory_movements(variant_id);

CREATE INDEX idx_inventory_movements_created_at
    ON inventory_movements(created_at);

CREATE INDEX idx_inventory_movements_reference
    ON inventory_movements(reference_type, reference_id);