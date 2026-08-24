-- O5: MES 事件触发器
-- 扩展 workflow_triggers.type 允许 'mes'（MES 事件订阅，区别于 webhook 路径订阅）
ALTER TABLE workflow_triggers DROP CONSTRAINT IF EXISTS workflow_triggers_type_check;
ALTER TABLE workflow_triggers ADD CONSTRAINT workflow_triggers_type_check CHECK (type IN ('webhook','cron','mes'));
