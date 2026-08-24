-- 030_payment_wallet.sql
-- 钱包余额 + 充值订单 + 交易流水 + 平台支付通道配置

-- 钱包（每个租户一个，预创建 0 余额账户）
CREATE TABLE IF NOT EXISTS tenant_wallets (
  tenant_id    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  balance      NUMERIC(14,6) NOT NULL DEFAULT 0,
  frozen       NUMERIC(14,6) NOT NULL DEFAULT 0,  -- 预留：处理中的冻结金额
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 充值订单（虎皮椒 / 预留官方微信、官方支付宝）
CREATE TABLE IF NOT EXISTS recharge_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no        VARCHAR(64) UNIQUE NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_yuan     NUMERIC(14,2) NOT NULL,
  channel         VARCHAR(32) NOT NULL DEFAULT 'xunhu',  -- xunhu | wechat | alipay（预留）
  status          VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | paid | expired | failed | refunded
  notify_payload  JSONB,                                  -- 回调原文，便于审计
  notify_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_tenant ON recharge_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_status ON recharge_orders(status, expires_at);

-- 钱包交易流水（充值入账 / 消费扣费 / 退款 / 调账）
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind          VARCHAR(16) NOT NULL,           -- recharge | consume | refund | adjust
  amount        NUMERIC(14,6) NOT NULL,          -- 正负号表达方向（正入账、负扣费）
  balance_after NUMERIC(14,6) NOT NULL,
  ref_type      VARCHAR(32),                    -- order | usage | manual
  ref_id        VARCHAR(64),
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_tenant ON wallet_transactions(tenant_id, created_at DESC);

-- 平台支付通道配置（key/value 形式，平台管理员在配置页写入）
CREATE TABLE IF NOT EXISTS payment_settings (
  key          VARCHAR(64) PRIMARY KEY,
  value        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 通道启用开关（默认 xunhu = false：未配置就启用，但请求会因为密钥缺失失败，便于测试；官方通道默认 false）
INSERT INTO payment_settings(key, value) VALUES
  ('xunhu_enabled',         'false'),
  ('xunhu_app_id',          ''),
  ('xunhu_app_secret',      ''),
  ('xunhu_gateway',         'https://api.xunhupay.com/payment/do.html'),
  -- 官方微信支付 V3（预留接口，本期不实装）
  ('wechat_enabled',        'false'),
  ('wechat_mch_id',         ''),
  ('wechat_app_id',         ''),
  ('wechat_api_v3_key',     ''),
  ('wechat_serial_no',      ''),
  ('wechat_private_key',    ''),
  ('wechat_notify_url',     ''),
  -- 官方支付宝（预留接口，本期不实装）
  ('alipay_enabled',        'false'),
  ('alipay_app_id',         ''),
  ('alipay_private_key',    ''),
  ('alipay_public_key',     ''),
  ('alipay_notify_url',     ''),
  ('alipay_gateway',        'https://openapi.alipay.com/gateway.do')
ON CONFLICT (key) DO NOTHING;
