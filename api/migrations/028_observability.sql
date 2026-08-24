-- F6: 可观测性 —— LLM token/成本用量记录 + Agent 调用链日志持久化（可检索）
-- 幂等：全程使用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS

-- 1) LLM 用量记录：每次 chat / embedding / tool 调用落一条，用于成本核算与观测
CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id UUID,
  node_id VARCHAR(200),
  agent_id UUID,
  session_id UUID,
  kind VARCHAR(32) NOT NULL DEFAULT 'chat',   -- chat / embedding / stream / tool
  provider_id UUID,
  provider_name VARCHAR(200),
  model VARCHAR(200),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_tenant_time ON llm_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_execution ON llm_usage(execution_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_agent ON llm_usage(agent_id);

-- 2) Agent 调用链日志：记录每个 agent 会话中逐轮 LLM 与工具调用，供回放与检索
CREATE TABLE IF NOT EXISTS agent_call_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID,
  session_id UUID,
  execution_id UUID,
  step VARCHAR(16) NOT NULL,              -- llm / tool
  tool_name VARCHAR(200),
  args JSONB,
  result JSONB,
  llm_model VARCHAR(200),
  llm_prompt_tokens INTEGER,
  llm_completion_tokens INTEGER,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_call_traces_session ON agent_call_traces(tenant_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_call_traces_execution ON agent_call_traces(execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_call_traces_agent ON agent_call_traces(tenant_id, agent_id, created_at DESC);