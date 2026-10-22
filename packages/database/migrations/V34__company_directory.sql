-- V34 · Fase 4B (plataforma Trama): directorio público de tiendas.
-- listed: la tienda aparece en /tiendas (las tiendas de las demos automáticas no).
-- segment: público objetivo, para filtrar el directorio.

ALTER TABLE companies
    ADD COLUMN listed BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN segment VARCHAR(20),
    ADD CONSTRAINT ck_companies_segment CHECK (segment IS NULL OR segment IN ('MUJER', 'HOMBRE', 'DEPORTIVA', 'INFANTIL', 'UNISEX'));

UPDATE companies SET listed = false WHERE slug LIKE 'demo-%';

UPDATE companies SET segment = 'MUJER' WHERE slug = 'velora';
UPDATE companies SET segment = 'UNISEX' WHERE slug IN ('urbano-boutique', 'urbano-outlet', 'andina-moda', 'primer-paso');

CREATE INDEX idx_companies_directory ON companies(name) WHERE active AND listed;
