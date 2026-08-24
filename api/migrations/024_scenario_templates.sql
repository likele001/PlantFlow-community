-- 024_scenario_templates.sql
-- N2: 分行业场景模板市场
-- 1) 给 bot_scenarios 增加导入载荷列：保存"导入时要生成什么 Agent / 工作流"
ALTER TABLE bot_scenarios ADD COLUMN IF NOT EXISTS template_payload JSONB;

-- 2) 内置模板按 (industry, name) 唯一，保证 seed 幂等可重跑
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_scenarios_builtin_industry_name
  ON bot_scenarios(industry, name) WHERE is_builtin = true;

-- 3) 查询辅助索引
CREATE INDEX IF NOT EXISTS idx_bot_scenarios_is_builtin ON bot_scenarios(is_builtin);