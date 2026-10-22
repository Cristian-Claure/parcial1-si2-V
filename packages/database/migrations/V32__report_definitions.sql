-- V32 · Fase 3: definiciones guardadas del constructor de reportes.
-- La definición guarda SOLO identificadores del catálogo semántico (dimensiones, medidas,
-- filtros, orden y período); nunca SQL. El backend la valida de nuevo al ejecutarla.

CREATE TABLE report_definitions (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,
    created_by UUID NOT NULL
        REFERENCES app_users(id)
        ON DELETE RESTRICT,
    name VARCHAR(80) NOT NULL,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_report_definitions_name CHECK (length(btrim(name)) >= 2),
    CONSTRAINT ck_report_definitions_object CHECK (jsonb_typeof(definition) = 'object')
);

-- Nombre único por empresa (sin distinguir mayúsculas).
CREATE UNIQUE INDEX uq_report_definitions_company_name
    ON report_definitions(company_id, lower(name));

CREATE INDEX idx_report_definitions_created_by
    ON report_definitions(created_by);
