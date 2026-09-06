-- P12C1: targeted indexes confirmed by query/source usage.
-- Keep this migration intentionally narrow; do not index every foreign key.

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_pos
    ON orders (cash_session_id, point_of_sale_id);

CREATE INDEX IF NOT EXISTS idx_orders_pos_warehouse
    ON orders (point_of_sale_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_orders_address_id
    ON orders (address_id);
