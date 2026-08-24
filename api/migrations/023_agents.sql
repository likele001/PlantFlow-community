-- 023_agents.sql
-- N1-A: 单 Agent 地基 - agents 表 + agent_sessions 表

CREATE TABLE IF NOT EXISTS agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  system_prompt    TEXT NOT NULL DEFAULT '',
  model_provider_id UUID REFERENCES llm_providers(id) ON DELETE SET NULL,
  tools            JSONB NOT NULL DEFAULT '[]',
  allowed_sources  JSONB NOT NULL DEFAULT '[]',
  max_turns        INT  NOT NULL DEFAULT 10,
  timeout_ms       INT  NOT NULL DEFAULT 60000,
  status           TEXT NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_tenant_name
  ON agents(tenant_id, name);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  channel     TEXT,
  external_id TEXT,
  summary     TEXT NOT NULL DEFAULT '',
  history     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant ON agent_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_sessions_tenant_agent_channel_external
  ON agent_sessions(tenant_id, agent_id, channel, external_id)
  WHERE channel IS NOT NULL AND external_id IS NOT NULL;
