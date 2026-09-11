ALTER TABLE stores
    ADD COLUMN description VARCHAR(500),
    ADD COLUMN city VARCHAR(120),
    ADD COLUMN phone VARCHAR(40),
    ADD COLUMN email VARCHAR(180);

CREATE INDEX idx_stores_city
    ON stores(city);

CREATE INDEX idx_stores_active
    ON stores(active);