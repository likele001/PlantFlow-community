-- 钉钉渠道配置
-- 2026-07-06

-- 为 channel_configs 表添加 dingtalk 列
ALTER TABLE channel_configs 
  ADD COLUMN IF NOT EXISTS dingtalk JSONB;

-- 更新 bot_sessions 表的 channel 约束
ALTER TABLE bot_sessions 
  DROP CONSTRAINT IF EXISTS bot_sessions_channel_check;

ALTER TABLE bot_sessions 
  ADD CONSTRAINT bot_sessions_channel_check 
  CHECK (channel IN ('wecom','feishu','dingtalk'));

-- 更新 conversations 表的 channel 约束
ALTER TABLE conversations 
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE conversations 
  ADD CONSTRAINT conversations_channel_check 
  CHECK (channel IN ('wecom','feishu','dingtalk','taobao'));
