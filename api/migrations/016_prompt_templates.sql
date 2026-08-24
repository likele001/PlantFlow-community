-- Prompt 模板管理
-- 2026-07-06

CREATE TABLE IF NOT EXISTS prompt_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_prompt   TEXT NOT NULL DEFAULT '',
  variables     JSONB DEFAULT '[]',
  tags          TEXT[] DEFAULT '{}',
  version       INTEGER NOT NULL DEFAULT 1,
  is_latest     BOOLEAN NOT NULL DEFAULT true,
  source_id     UUID, -- 指向原始模板（用于版本追踪）
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant ON prompt_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_source ON prompt_templates(source_id);
