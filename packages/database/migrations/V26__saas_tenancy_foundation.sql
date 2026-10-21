-- V26 · SaaS tenancy foundation
-- Agrega el rol PLATFORM_ADMIN, el propietario de cada compañía y su slug público.
-- El propietario NO se infiere aquí: lo asigna el bootstrap del backend
-- (BOOTSTRAP_ADMIN_*) o un PLATFORM_ADMIN. Una compañía sin propietario
-- solo es visible para PLATFORM_ADMIN.

ALTER TABLE app_users
    DROP CONSTRAINT ck_app_users_role;

ALTER TABLE app_users
    ADD CONSTRAINT ck_app_users_role
        CHECK (
            role IN (
                'PLATFORM_ADMIN',
                'ADMIN',
                'STORE_MANAGER',
                'CUSTOMER'
            )
        );

ALTER TABLE companies
    ADD COLUMN owner_user_id UUID,
    ADD COLUMN slug VARCHAR(60);

ALTER TABLE companies
    ADD CONSTRAINT fk_companies_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES app_users(id)
        ON DELETE RESTRICT;

UPDATE companies
SET slug = trim(
        BOTH '-' FROM
        regexp_replace(
            lower(code),
            '[^a-z0-9]+',
            '-',
            'g'
        )
    )
WHERE slug IS NULL;

ALTER TABLE companies
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE companies
    ADD CONSTRAINT uq_companies_slug
        UNIQUE (slug);

ALTER TABLE companies
    ADD CONSTRAINT ck_companies_slug
        CHECK (
            slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$'
        );

CREATE INDEX idx_companies_owner
    ON companies(owner_user_id);
