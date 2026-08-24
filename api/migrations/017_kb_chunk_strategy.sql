-- 知识库分块策略
-- 2026-07-06

ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS chunk_strategy TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS chunk_size INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS chunk_overlap INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS separator TEXT DEFAULT '\n\n';

-- 添加文档分块配置字段
ALTER TABLE knowledge_documents 
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;
