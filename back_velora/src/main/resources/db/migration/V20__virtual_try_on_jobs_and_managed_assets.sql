ALTER TABLE product_images
    ADD COLUMN storage_key VARCHAR(120);

UPDATE product_images
SET storage_key =
        regexp_replace(
            image_url,
            '^.*/api/catalog/assets/',
            ''
        )
WHERE image_url ~
        '/api/catalog/assets/[0-9a-fA-F-]{36}\.(jpg|png|webp)$';

ALTER TABLE product_images
    ADD CONSTRAINT ck_product_images_storage_key
        CHECK (
            storage_key IS NULL
            OR storage_key ~
                '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
        );

CREATE UNIQUE INDEX uq_product_images_storage_key
    ON product_images(storage_key)
    WHERE storage_key IS NOT NULL;

CREATE TABLE try_on_jobs (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL
        REFERENCES app_users(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id),

    variant_id UUID
        REFERENCES product_variants(id),

    garment_image_id UUID NOT NULL
        REFERENCES product_images(id),

    provider VARCHAR(20) NOT NULL,

    external_job_id VARCHAR(255),

    status VARCHAR(20) NOT NULL,

    result_storage_key VARCHAR(120),

    result_content_type VARCHAR(60),

    result_size_bytes BIGINT,

    error_message VARCHAR(500),

    duration_ms BIGINT,

    created_at TIMESTAMPTZ NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL,

    completed_at TIMESTAMPTZ,

    CONSTRAINT ck_try_on_jobs_provider
        CHECK (provider IN ('LOCAL', 'REPLICATE')),

    CONSTRAINT ck_try_on_jobs_status
        CHECK (
            status IN (
                'QUEUED',
                'PROCESSING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        ),

    CONSTRAINT ck_try_on_jobs_result_size
        CHECK (
            result_size_bytes IS NULL
            OR result_size_bytes > 0
        ),

    CONSTRAINT ck_try_on_jobs_duration
        CHECK (
            duration_ms IS NULL
            OR duration_ms >= 0
        ),

    CONSTRAINT ck_try_on_jobs_result_shape
        CHECK (
            (
                result_storage_key IS NULL
                AND result_content_type IS NULL
                AND result_size_bytes IS NULL
            )
            OR
            (
                result_storage_key IS NOT NULL
                AND result_content_type IS NOT NULL
                AND result_size_bytes IS NOT NULL
            )
        ),

    CONSTRAINT ck_try_on_jobs_success_has_result
        CHECK (
            status <> 'SUCCEEDED'
            OR result_storage_key IS NOT NULL
        )
);

CREATE INDEX idx_try_on_jobs_user_created
    ON try_on_jobs(user_id, created_at DESC);

CREATE INDEX idx_try_on_jobs_user_status
    ON try_on_jobs(user_id, status);

CREATE UNIQUE INDEX uq_try_on_jobs_provider_external
    ON try_on_jobs(provider, external_job_id)
    WHERE external_job_id IS NOT NULL;
