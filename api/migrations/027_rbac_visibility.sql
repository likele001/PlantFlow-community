-- N8: 数据可见性隔离 —— 为资源增加 created_by 以便 operator/agent 角色仅能读写自己创建的数据
-- 幂等：每个变更均有条件判断。

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_executions_created_by ON executions(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_created_by ON knowledge_bases(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_agents_created_by ON agents(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_connectors_created_by ON connectors(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_credentials_created_by ON credentials(tenant_id, created_by);
