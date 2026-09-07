ALTER TABLE warehouses
    ADD COLUMN default_warehouse BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked_warehouses AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY store_id
            ORDER BY
                CASE WHEN active THEN 0 ELSE 1 END,
                created_at ASC,
                id ASC
        ) AS position_in_store
    FROM warehouses
)
UPDATE warehouses AS warehouse
SET default_warehouse = TRUE
FROM ranked_warehouses AS ranked
WHERE warehouse.id = ranked.id
  AND ranked.position_in_store = 1;

CREATE UNIQUE INDEX uq_warehouses_one_default_per_store
    ON warehouses(store_id)
    WHERE default_warehouse;
