-- 021_queue_reliability.sql
-- F1: 队列重试 / 死信 / 幂等。幂等执行，可在已有 execution_jobs 上安全运行。
-- 在现有 execution_jobs 上扩展重试相关字段（幂等）
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS attempt_count    INT  NOT NULL DEFAULT 0;
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS max_attempts     INT  NOT NULL DEFAULT 3;
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ;
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS last_error       TEXT;
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS dedup_key        TEXT;
ALTER TABLE execution_jobs ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

-- 可重试任务索引：仅 pending 且未到退避时间的任务可被捞取
CREATE INDEX IF NOT EXISTS idx_execution_jobs_retry
  ON execution_jobs(next_attempt_at, created_at)
  WHERE status = 'pending';

-- 幂等约束：同一 dedup_key 不重复入队（partial unique index，dedup_key 非空时生效）
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_jobs_dedup
  ON execution_jobs(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- 死信表
CREATE TABLE IF NOT EXISTS dead_letters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID,
  tenant_id   UUID,
  workflow_id UUID,
  reason      TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 清理已完成的、带幂等键的过期 job（防止 dedup 唯一索引无限膨胀）
CREATE INDEX IF NOT EXISTS idx_execution_jobs_reap
  ON execution_jobs(created_at)
  WHERE status IN ('done','failed');