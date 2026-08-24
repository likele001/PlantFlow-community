-- P0: 团队邀请制 — 管理员生成邀请链接，成员凭链接注册并加入团队
CREATE TABLE IF NOT EXISTS team_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT,                            -- 可选：限定邮箱（留空则任意邮箱可用）
  role        TEXT NOT NULL CHECK (role IN ('tenant_admin','developer','operator','agent')),
  token       TEXT NOT NULL UNIQUE,
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_invites_tenant ON team_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
