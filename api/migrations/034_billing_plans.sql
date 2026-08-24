-- 034_billing_plans.sql
-- P1 商业化加固：套餐 / 订阅 / 计费模式（按量钱包 与 月付套餐 可自由切换）

-- 套餐定义
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,            -- 钱包货币单位（与 tenant_wallets.balance 同单位）
  period VARCHAR(16) NOT NULL DEFAULT 'monthly',     -- monthly | yearly
  included_calls INTEGER NOT NULL DEFAULT 0,          -- 含 AI 调用次数
  included_tokens BIGINT NOT NULL DEFAULT 0,          -- 含 Token 数
  included_executions INTEGER NOT NULL DEFAULT 0,     -- 含工作流执行次数
  overage_strategy VARCHAR(8) NOT NULL DEFAULT 'payg', -- cap | payg
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_name ON plans(name);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active, sort_order);

-- 租户订阅
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(16) NOT NULL DEFAULT 'active',       -- active | cancelled | expired
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  included_calls INTEGER NOT NULL DEFAULT 0,
  included_tokens BIGINT NOT NULL DEFAULT 0,
  included_executions INTEGER NOT NULL DEFAULT 0,
  used_calls INTEGER NOT NULL DEFAULT 0,
  used_tokens BIGINT NOT NULL DEFAULT 0,
  used_executions INTEGER NOT NULL DEFAULT 0,
  overage_strategy VARCHAR(8) NOT NULL DEFAULT 'payg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_tenant ON tenant_subscriptions(tenant_id, status, ends_at);

-- 租户计费模式：payg（按量钱包）| subscription（套餐）
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(16) NOT NULL DEFAULT 'payg';

-- 默认套餐（幂等 seed）
INSERT INTO plans (name, description, price, period, included_calls, included_tokens, included_executions, overage_strategy, sort_order)
VALUES
  ('免费体验', '新用户试用：含少量额度，超额即停', 0, 'monthly', 100, 200000, 20, 'cap', 0),
  ('基础版', '小型团队：含常用额度，超额转按量', 30, 'monthly', 2000, 2000000, 200, 'payg', 1),
  ('专业版', '成长团队：更高额度与执行次数', 99, 'monthly', 10000, 10000000, 1000, 'payg', 2),
  ('旗舰版', '企业级：海量额度与执行', 299, 'monthly', 50000, 50000000, 5000, 'payg', 3)
ON CONFLICT (name) DO NOTHING;
