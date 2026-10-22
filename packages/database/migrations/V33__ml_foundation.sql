-- V33 · Fase 4: resultados del servicio ML local (Python). Python escribe SOLO en estas tablas.
-- Cada fila lleva company_id; los resultados cuelgan de su corrida y se borran con ella.

CREATE TABLE ml_runs (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    model_key VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    rows_used INTEGER,
    data_from DATE,
    data_to DATE,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    artifact_version VARCHAR(120),
    requested_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    error VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    CONSTRAINT ck_ml_runs_model CHECK (model_key IN ('SALES_FORECAST', 'CANCEL_RISK', 'CUSTOMER_SEGMENTS', 'SALES_ANOMALIES')),
    CONSTRAINT ck_ml_runs_status CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INSUFFICIENT_DATA'))
);

CREATE INDEX idx_ml_runs_company_model ON ml_runs(company_id, model_key, created_at DESC);
CREATE INDEX idx_ml_runs_active ON ml_runs(company_id) WHERE status IN ('QUEUED', 'RUNNING');

CREATE TABLE ml_forecasts (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES ml_runs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    kind VARCHAR(10) NOT NULL,
    actual NUMERIC(14, 2),
    predicted NUMERIC(14, 2) NOT NULL,
    lower_bound NUMERIC(14, 2),
    upper_bound NUMERIC(14, 2),
    CONSTRAINT ck_ml_forecasts_kind CHECK (kind IN ('BACKTEST', 'FORECAST')),
    CONSTRAINT uq_ml_forecasts_run_day UNIQUE (run_id, kind, day)
);
CREATE INDEX idx_ml_forecasts_company_run ON ml_forecasts(company_id, run_id);

CREATE TABLE ml_customer_segments (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES ml_runs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    segment INTEGER NOT NULL,
    segment_name VARCHAR(60) NOT NULL,
    recency_days INTEGER NOT NULL,
    frequency INTEGER NOT NULL,
    monetary NUMERIC(14, 2) NOT NULL,
    pc1 DOUBLE PRECISION NOT NULL,
    pc2 DOUBLE PRECISION NOT NULL,
    CONSTRAINT uq_ml_segments_run_customer UNIQUE (run_id, customer_id)
);
CREATE INDEX idx_ml_segments_company_run ON ml_customer_segments(company_id, run_id);

CREATE TABLE ml_anomalies (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES ml_runs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    actual NUMERIC(14, 2) NOT NULL,
    expected NUMERIC(14, 2) NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    is_anomaly BOOLEAN NOT NULL,
    direction VARCHAR(4),
    explanation VARCHAR(200),
    CONSTRAINT uq_ml_anomalies_run_day UNIQUE (run_id, day)
);
CREATE INDEX idx_ml_anomalies_company_run ON ml_anomalies(company_id, run_id);

CREATE TABLE ml_order_risk (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES ml_runs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    probability DOUBLE PRECISION NOT NULL,
    risk_level VARCHAR(10) NOT NULL,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_ml_order_risk_level CHECK (risk_level IN ('ALTO', 'MEDIO', 'BAJO')),
    CONSTRAINT uq_ml_order_risk_run_order UNIQUE (run_id, order_id)
);
CREATE INDEX idx_ml_order_risk_company_run ON ml_order_risk(company_id, run_id);
