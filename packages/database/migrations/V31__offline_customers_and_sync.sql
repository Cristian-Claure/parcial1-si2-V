-- V31 · Fase 2 offline: clientes registrados por la empresa, versión por fila,
-- registro de cambios para pull incremental y operaciones aplicadas (idempotencia).

-- 1) Clientes sin acceso (registrados por un encargado/propietario sin red).
--    Reutiliza app_users: email y contraseña pasan a ser opcionales SOLO para ellos.
ALTER TABLE app_users
    ADD COLUMN registered_company_id UUID
        REFERENCES companies(id)
        ON DELETE RESTRICT;

ALTER TABLE app_users
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE app_users
    ADD CONSTRAINT ck_app_users_credentials
        CHECK (
            (email IS NOT NULL AND password_hash IS NOT NULL)
            OR (
                role = 'CUSTOMER'
                AND registered_company_id IS NOT NULL
                AND password_hash IS NULL
            )
        );

-- Documento único por empresa para los clientes que ella registra.
CREATE UNIQUE INDEX uq_app_users_company_tax_id
    ON app_users(registered_company_id, lower(tax_id))
    WHERE registered_company_id IS NOT NULL
      AND tax_id IS NOT NULL;

CREATE UNIQUE INDEX uq_app_users_email_ci
    ON app_users(lower(email))
    WHERE email IS NOT NULL;

CREATE INDEX idx_app_users_registered_company
    ON app_users(registered_company_id)
    WHERE registered_company_id IS NOT NULL;

-- 2) Versión por fila para ediciones offline con control optimista.
ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE product_variants ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_users ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE FUNCTION velora_bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_products_version BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION velora_bump_version();
CREATE TRIGGER trg_product_variants_version BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION velora_bump_version();
CREATE TRIGGER trg_app_users_version BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION velora_bump_version();

-- 3) Registro de cambios para el pull incremental. tx_id (xid8) es el cursor:
--    el pull devuelve cambios con tx_id < xmin del snapshot actual (transacciones ya
--    terminadas), así ningún cambio en vuelo queda atrás del cursor.
CREATE TABLE sync_changes (
    seq BIGSERIAL PRIMARY KEY,
    tx_id XID8 NOT NULL DEFAULT pg_current_xact_id(),
    company_id UUID NOT NULL,
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,
    op VARCHAR(10) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_sync_changes_entity
        CHECK (entity_type IN ('CATEGORY', 'PRODUCT', 'STORE', 'WAREHOUSE', 'CUSTOMER')),

    CONSTRAINT ck_sync_changes_op
        CHECK (op IN ('UPSERT', 'DELETE'))
);

CREATE INDEX idx_sync_changes_company_tx
    ON sync_changes(company_id, tx_id);

CREATE FUNCTION velora_record_sync_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    rec RECORD;
    v_company UUID;
    v_type TEXT;
    v_id UUID;
    v_op TEXT := CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END;
BEGIN
    IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

    IF TG_TABLE_NAME = 'categories' THEN
        v_type := 'CATEGORY'; v_id := rec.id; v_company := rec.company_id;
    ELSIF TG_TABLE_NAME = 'products' THEN
        v_type := 'PRODUCT'; v_id := rec.id; v_company := rec.company_id;
    ELSIF TG_TABLE_NAME = 'product_variants' THEN
        v_type := 'PRODUCT'; v_id := rec.product_id; v_op := 'UPSERT';
        SELECT company_id INTO v_company FROM products WHERE id = rec.product_id;
    ELSIF TG_TABLE_NAME = 'inventory_stocks' THEN
        v_type := 'PRODUCT'; v_op := 'UPSERT';
        SELECT p.id, p.company_id INTO v_id, v_company
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = rec.variant_id;
    ELSIF TG_TABLE_NAME = 'stores' THEN
        v_type := 'STORE'; v_id := rec.id; v_company := rec.company_id;
    ELSIF TG_TABLE_NAME = 'warehouses' THEN
        v_type := 'WAREHOUSE'; v_id := rec.id;
        SELECT company_id INTO v_company FROM stores WHERE id = rec.store_id;
    ELSIF TG_TABLE_NAME = 'app_users' THEN
        IF rec.role <> 'CUSTOMER' OR rec.registered_company_id IS NULL THEN
            RETURN NULL;
        END IF;
        v_type := 'CUSTOMER'; v_id := rec.id; v_company := rec.registered_company_id;
    END IF;

    IF v_company IS NULL OR v_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO sync_changes (company_id, entity_type, entity_id, op)
    VALUES (v_company, v_type, v_id, v_op);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_sync_categories AFTER INSERT OR UPDATE OR DELETE ON categories
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_products AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_product_variants AFTER INSERT OR UPDATE OR DELETE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_inventory_stocks AFTER INSERT OR UPDATE ON inventory_stocks
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_stores AFTER INSERT OR UPDATE OR DELETE ON stores
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_warehouses AFTER INSERT OR UPDATE OR DELETE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();
CREATE TRIGGER trg_sync_customers AFTER INSERT OR UPDATE OR DELETE ON app_users
    FOR EACH ROW EXECUTE FUNCTION velora_record_sync_change();

-- 4) Operaciones offline aplicadas: un reenvío con el mismo client_operation_id
--    devuelve DUPLICATE con el mismo resultado.
CREATE TABLE sync_operations (
    client_operation_id UUID PRIMARY KEY,
    actor_user_id UUID NOT NULL REFERENCES app_users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    op_type VARCHAR(30) NOT NULL,
    entity_id UUID,
    result JSONB NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_operations_company
    ON sync_operations(company_id, applied_at);
