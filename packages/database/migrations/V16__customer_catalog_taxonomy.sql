-- Ciclo 3 / Punto 4.4D
-- Taxonomia CUSTOMER base para la oferta femenina VÉLORA.
-- No crea productos ficticios ni modifica productos existentes.

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
(
    '41000000-0000-0000-0000-000000000001',
    NULL,
    'Ropa',
    'ropa',
    'Prendas femeninas para uso diario, trabajo, eventos y ocasiones especiales.',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
(
    '41000000-0000-0000-0000-000000000002',
    NULL,
    'Calzado',
    'calzado',
    'Calzado femenino para distintas ocasiones y estilos.',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
(
    '41000000-0000-0000-0000-000000000003',
    NULL,
    'Lencería',
    'lenceria',
    'Lencería, ropa interior y prendas íntimas femeninas.',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
(
    '41000000-0000-0000-0000-000000000004',
    NULL,
    'Accesorios',
    'accesorios',
    'Complementos para completar el look VÉLORA.',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
('41000000-0000-0000-0000-000000000101', (SELECT id FROM categories WHERE slug = 'ropa'), 'Vestidos', 'vestidos', 'Vestidos casuales, formales y de ocasión.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000102', (SELECT id FROM categories WHERE slug = 'ropa'), 'Blusas y tops', 'blusas-y-tops', 'Blusas, tops y prendas superiores femeninas.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000103', (SELECT id FROM categories WHERE slug = 'ropa'), 'Camisas', 'camisas', 'Camisas femeninas casuales y formales.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000104', (SELECT id FROM categories WHERE slug = 'ropa'), 'Pantalones', 'pantalones', 'Pantalones femeninos en distintos cortes y telas.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000105', (SELECT id FROM categories WHERE slug = 'ropa'), 'Jeans', 'jeans', 'Jeans femeninos en diferentes calces.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000106', (SELECT id FROM categories WHERE slug = 'ropa'), 'Faldas', 'faldas', 'Faldas femeninas para diferentes ocasiones.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000107', (SELECT id FROM categories WHERE slug = 'ropa'), 'Shorts', 'shorts', 'Shorts femeninos casuales y de temporada.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000108', (SELECT id FROM categories WHERE slug = 'ropa'), 'Chaquetas', 'chaquetas', 'Chaquetas y capas ligeras femeninas.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000109', (SELECT id FROM categories WHERE slug = 'ropa'), 'Abrigos', 'abrigos', 'Abrigos y prendas exteriores femeninas.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000110', (SELECT id FROM categories WHERE slug = 'ropa'), 'Conjuntos', 'conjuntos', 'Conjuntos y looks coordinados.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
('41000000-0000-0000-0000-000000000201', (SELECT id FROM categories WHERE slug = 'calzado'), 'Zapatos', 'zapatos', 'Zapatos femeninos casuales y formales.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000202', (SELECT id FROM categories WHERE slug = 'calzado'), 'Sandalias', 'sandalias', 'Sandalias femeninas para temporada y ocasión.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000203', (SELECT id FROM categories WHERE slug = 'calzado'), 'Botas', 'botas', 'Botas y botines femeninos.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000204', (SELECT id FROM categories WHERE slug = 'calzado'), 'Tenis', 'tenis', 'Tenis y calzado urbano femenino.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
('41000000-0000-0000-0000-000000000301', (SELECT id FROM categories WHERE slug = 'lenceria'), 'Ropa interior', 'ropa-interior', 'Ropa interior femenina.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000302', (SELECT id FROM categories WHERE slug = 'lenceria'), 'Sujetadores', 'sujetadores', 'Sujetadores y bralettes femeninos.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000303', (SELECT id FROM categories WHERE slug = 'lenceria'), 'Bodies', 'bodies', 'Bodies y prendas íntimas de una pieza.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();

INSERT INTO categories (
    id, parent_id, name, slug, description, active, created_at, updated_at
)
VALUES
('41000000-0000-0000-0000-000000000401', (SELECT id FROM categories WHERE slug = 'accesorios'), 'Bolsos', 'bolsos', 'Bolsos, carteras y complementos de mano.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000402', (SELECT id FROM categories WHERE slug = 'accesorios'), 'Gafas', 'gafas', 'Gafas y accesorios ópticos de moda.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000403', (SELECT id FROM categories WHERE slug = 'accesorios'), 'Joyería', 'joyeria', 'Joyería y bisutería femenina.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000404', (SELECT id FROM categories WHERE slug = 'accesorios'), 'Cinturones', 'cinturones', 'Cinturones y complementos para silueta.', TRUE, NOW(), NOW()),
('41000000-0000-0000-0000-000000000405', (SELECT id FROM categories WHERE slug = 'accesorios'), 'Accesorios de cabello', 'accesorios-cabello', 'Accesorios para cabello y estilismo.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO UPDATE
SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = TRUE,
    updated_at = NOW();