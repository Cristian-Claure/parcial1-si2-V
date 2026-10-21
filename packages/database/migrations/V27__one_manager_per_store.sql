-- V27 · Un encargado activo por sucursal
-- Backfill: si una sucursal tiene varios STORE_MANAGER activos, se conserva el
-- de actividad más reciente (último audit_event; si no tiene, updated_at) y
-- los demás pasan a INACTIVE. No se borra a nadie y cada cambio queda auditado.

CREATE TEMP TABLE v27_demoted_managers ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.store_id,
        ROW_NUMBER() OVER (
            PARTITION BY u.store_id
            ORDER BY
                COALESCE(
                    (
                        SELECT MAX(ae.occurred_at)
                        FROM audit_events ae
                        WHERE ae.actor_user_id = u.id
                    ),
                    u.updated_at
                ) DESC,
                u.updated_at DESC,
                u.id
        ) AS position
    FROM app_users u
    WHERE u.role = 'STORE_MANAGER'
      AND u.status = 'ACTIVE'
)
SELECT id, email, first_name, last_name, store_id
FROM ranked
WHERE position > 1;

UPDATE app_users u
SET status = 'INACTIVE',
    updated_at = NOW()
FROM v27_demoted_managers d
WHERE u.id = d.id;

INSERT INTO audit_events (
    id,
    occurred_at,
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    category,
    http_method,
    route_pattern,
    request_path,
    status_code,
    success,
    request_id
)
SELECT
    gen_random_uuid(),
    NOW(),
    NULL,
    NULL,
    'Migración V27',
    'SYSTEM',
    'ADMIN',
    'PATCH',
    'migration:V27__one_manager_per_store',
    'app_users/' || d.id || '/status/INACTIVE?store=' || d.store_id,
    200,
    TRUE,
    'migration-v27'
FROM v27_demoted_managers d;

CREATE UNIQUE INDEX uq_app_users_active_manager_per_store
    ON app_users(store_id)
    WHERE role = 'STORE_MANAGER'
      AND status = 'ACTIVE';
