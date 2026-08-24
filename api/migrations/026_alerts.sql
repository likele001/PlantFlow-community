-- 026_alerts.sql
-- N5 执行告警 - 告警订阅表 + 站内通知表

-- 告警订阅：用户对工作流失败配置接收方式（inbox=站内通知，webhook=回调URL）
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  workflow_id   UUID,                              -- NULL 表示订阅所有工作流
  user_id       UUID,                              -- 站内通知收件人；NULL 表示按 user_id 触发时通知
  channel       TEXT NOT NULL,                     -- inbox | webhook（可叠加）
  webhook_url   TEXT,                              -- channel=webhook 时必填
  webhook_secret TEXT,                             -- 可选：作为 X-Alert-Secret 头
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_subs_tenant ON alert_subscriptions (tenant_id, enabled);

-- 告警事件（站内通知载体）
CREATE TABLE IF NOT EXISTS alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  subscription_id UUID,                            -- 触发该 alert 的订阅，NULL 表示系统级
  execution_id   UUID,                            -- 关联失败执行
  workflow_id    UUID,
  user_id        UUID,                            -- 收件人（站内通知），NULL 表示租户级（webhook 也会落库用于审计）
  severity       TEXT NOT NULL DEFAULT 'error',    -- error | warning
  title          TEXT NOT NULL,
  message        TEXT NOT NULL,
  payload        JSONB,                           -- 结构化详情（错误栈、节点id 等）
  status         TEXT NOT NULL DEFAULT 'unread',   -- unread | read | resolved
  channel        TEXT NOT NULL DEFAULT 'inbox',   -- inbox | webhook
  delivered_at   TIMESTAMPTZ,                     -- 推送成功的时刻
  delivery_error TEXT,                            -- webhook 推送失败的错误
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_user
  ON alerts (tenant_id, user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_exec
  ON alerts (execution_id);