-- P6 · Stripe real.
-- external_reference contiene el Checkout Session id (cs_...).

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_payments_provider_external_reference
ON payments(provider, external_reference)
WHERE provider IS NOT NULL
  AND external_reference IS NOT NULL;