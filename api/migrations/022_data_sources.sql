-- 022_data_sources.sql
-- N9: 集中数据接入层 - 数据源表
-- 非敏感配置存 config JSONB，敏感凭证指向 credentials 表（复用 AES-256-GCM 加密）

CREATE TABLE IF NOT EXISTS data_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,                 -- mysql | postgres | http
  config        JSONB NOT NULL DEFAULT '{}',   -- 非敏感字段（host/port/url/database/path 模板等）
  credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | testing | active | error
  allow_query   BOOLEAN NOT NULL DEFAULT true,
  field_allowlist JSONB NOT NULL DEFAULT '[]', -- 允许暴露的字段列表，空=全部允许（非敏感列）
  last_ok_at    TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_sources_tenant ON data_sources(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sources_tenant_name
  ON data_sources(tenant_id, name);

-- 数据访问审计（敏感查询记录）
CREATE TABLE IF NOT EXISTS data_access_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id     UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  user_id       UUID,
  operation     TEXT NOT NULL,                 -- query | test | create | update | delete
  query_text    TEXT,                          -- 查询语句/请求体（脱敏后）
  row_count     INT,
  duration_ms   INT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_access_audit_tenant ON data_access_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_source ON data_access_audit(source_id, created_at DESC);
