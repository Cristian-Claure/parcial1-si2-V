-- V28 · Planes y suscripciones
-- Los límites viven como datos (seed idempotente). NULL en un límite = ilimitado.
-- La suscripción es por cuenta propietaria (company_id NULL). company_id existe
-- para poder pasar a plan por compañía sin cambiar el esquema.

CREATE TABLE plans (
    id UUID PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(60) NOT NULL,
    description VARCHAR(300),
    sort_order SMALLINT NOT NULL,
    price_monthly NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    trial_days INTEGER NOT NULL DEFAULT 0,

    max_companies INTEGER,
    max_stores_per_company INTEGER,
    max_products_per_company INTEGER,
    try_on_monthly_per_customer INTEGER,

    branding_tier VARCHAR(12) NOT NULL,
    report_tier VARCHAR(10) NOT NULL,
    report_history_days INTEGER,

    can_export BOOLEAN NOT NULL,
    can_dynamic_reports BOOLEAN NOT NULL,
    can_ml_dashboards BOOLEAN NOT NULL,
    can_ai_narrative BOOLEAN NOT NULL,
    can_voice_reports BOOLEAN NOT NULL,
    can_period_comparison BOOLEAN NOT NULL,
    can_store_filter BOOLEAN NOT NULL,

    loyalty_discounts JSONB,

    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_plans_code
        UNIQUE (code),

    CONSTRAINT ck_plans_code
        CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),

    CONSTRAINT ck_plans_price
        CHECK (price_monthly >= 0),

    CONSTRAINT ck_plans_trial_days
        CHECK (trial_days >= 0),

    CONSTRAINT ck_plans_limits
        CHECK (
            (max_companies IS NULL OR max_companies >= 1)
            AND (max_stores_per_company IS NULL OR max_stores_per_company >= 1)
            AND (max_products_per_company IS NULL OR max_products_per_company >= 0)
            AND (try_on_monthly_per_customer IS NULL OR try_on_monthly_per_customer >= 0)
            AND (report_history_days IS NULL OR report_history_days >= 1)
        ),

    CONSTRAINT ck_plans_branding_tier
        CHECK (branding_tier IN ('BASIC', 'FULL_PALETTE', 'FULL')),

    CONSTRAINT ck_plans_report_tier
        CHECK (report_tier IN ('BASIC', 'STANDARD', 'ADVANCED')),

    CONSTRAINT ck_plans_loyalty_discounts
        CHECK (
            loyalty_discounts IS NULL
            OR jsonb_typeof(loyalty_discounts) = 'object'
        )
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,

    owner_user_id UUID NOT NULL
        REFERENCES app_users(id)
        ON DELETE RESTRICT,

    company_id UUID
        REFERENCES companies(id)
        ON DELETE RESTRICT,

    plan_id UUID NOT NULL
        REFERENCES plans(id)
        ON DELETE RESTRICT,

    status VARCHAR(12) NOT NULL,

    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ,

    grandfathered BOOLEAN NOT NULL DEFAULT FALSE,

    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_subscriptions_status
        CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED')),

    CONSTRAINT ck_subscriptions_period
        CHECK (
            current_period_end IS NULL
            OR current_period_end > current_period_start
        ),

    CONSTRAINT ck_subscriptions_cancelled
        CHECK (
            (status = 'CANCELLED') = (cancelled_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX uq_subscriptions_current_owner
    ON subscriptions(owner_user_id)
    WHERE company_id IS NULL
      AND status <> 'CANCELLED';

CREATE UNIQUE INDEX uq_subscriptions_current_company
    ON subscriptions(company_id)
    WHERE company_id IS NOT NULL
      AND status <> 'CANCELLED';

CREATE INDEX idx_subscriptions_plan
    ON subscriptions(plan_id);

INSERT INTO plans (
    id, code, name, description, sort_order, price_monthly, currency, trial_days,
    max_companies, max_stores_per_company, max_products_per_company, try_on_monthly_per_customer,
    branding_tier, report_tier, report_history_days,
    can_export, can_dynamic_reports, can_ml_dashboards, can_ai_narrative,
    can_voice_reports, can_period_comparison, can_store_filter,
    loyalty_discounts, active, created_at, updated_at
)
VALUES
(
    '20000000-0000-0000-0000-000000000001', 'FREE', 'Free',
    'Para empezar: una tienda con lo esencial.',
    1, 0, 'BOB', 0,
    1, 1, 25, 3,
    'BASIC', 'BASIC', 30,
    FALSE, FALSE, FALSE, FALSE,
    FALSE, FALSE, FALSE,
    NULL, TRUE, NOW(), NOW()
),
(
    '20000000-0000-0000-0000-000000000002', 'PLUS', 'Plus',
    'Para crecer: más tiendas, sucursales y reportes completos.',
    2, 99, 'BOB', 14,
    2, 3, 200, 20,
    'FULL_PALETTE', 'STANDARD', 365,
    TRUE, TRUE, FALSE, TRUE,
    FALSE, TRUE, TRUE,
    NULL, TRUE, NOW(), NOW()
),
(
    '20000000-0000-0000-0000-000000000003', 'MAX', 'Max',
    'Para escalar: sin límites de catálogo, descuentos automáticos y analítica avanzada.',
    3, 249, 'BOB', 14,
    5, 10, NULL, NULL,
    'FULL', 'ADVANCED', NULL,
    TRUE, TRUE, TRUE, TRUE,
    TRUE, TRUE, TRUE,
    '{"basis":"FULFILLED_AMOUNT","windowDays":365,"tiers":[{"minAmount":1500,"percent":5},{"minAmount":4000,"percent":10},{"minAmount":8000,"percent":15}]}'::jsonb,
    TRUE, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    price_monthly = EXCLUDED.price_monthly,
    currency = EXCLUDED.currency,
    trial_days = EXCLUDED.trial_days,
    max_companies = EXCLUDED.max_companies,
    max_stores_per_company = EXCLUDED.max_stores_per_company,
    max_products_per_company = EXCLUDED.max_products_per_company,
    try_on_monthly_per_customer = EXCLUDED.try_on_monthly_per_customer,
    branding_tier = EXCLUDED.branding_tier,
    report_tier = EXCLUDED.report_tier,
    report_history_days = EXCLUDED.report_history_days,
    can_export = EXCLUDED.can_export,
    can_dynamic_reports = EXCLUDED.can_dynamic_reports,
    can_ml_dashboards = EXCLUDED.can_ml_dashboards,
    can_ai_narrative = EXCLUDED.can_ai_narrative,
    can_voice_reports = EXCLUDED.can_voice_reports,
    can_period_comparison = EXCLUDED.can_period_comparison,
    can_store_filter = EXCLUDED.can_store_filter,
    loyalty_discounts = EXCLUDED.loyalty_discounts,
    updated_at = NOW();
