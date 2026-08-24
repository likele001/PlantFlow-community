-- 031_platform_admin.sql
-- 平台后台独立登录：复用 users/sessions 表，sessions 加 kind 列区分 'tenant' vs 'platform'

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'tenant';
CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions(kind);

-- 平台登录尝试审计（用于安全策略：5 次失败锁定 10 分钟等）
CREATE TABLE IF NOT EXISTS platform_login_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier    VARCHAR(128) NOT NULL,    -- 邮箱或用户名
  ip            VARCHAR(64),
  success       BOOLEAN NOT NULL DEFAULT false,
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pl_login_attempts_id ON platform_login_attempts(identifier, created_at DESC);

-- 把已有 platform_admin 的用户置为可登录平台后台（保证迁移幂等）
-- 注：memberships 表里 role = 'platform_admin' 的记录即是平台账号