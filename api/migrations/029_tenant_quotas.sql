-- N7: 多租户运营配额
CREATE TABLE IF NOT EXISTS tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  max_calls INTEGER,
  max_tokens BIGINT,
  max_cost NUMERIC(14,6),
  period VARCHAR(16) NOT NULL DEFAULT 'monthly',  -- monthly / yearly
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant ON tenant_quotas(tenant_id);