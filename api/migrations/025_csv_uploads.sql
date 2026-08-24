-- 025_csv_uploads.sql
-- N4 第二批连接器：表格上传存储 + 数据源 kind 扩展

-- 上传的表格文件（CSV / XLSX），限定单文件 2MB（业务数据源用），按 data_source 关联
CREATE TABLE IF NOT EXISTS data_source_uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  source_id    UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  -- 解析后的行数据（CSV 一定存；XLSX 仅存首 sheet）；JSONB 数组存 rows
  rows         JSONB NOT NULL,
  columns      TEXT[] NOT NULL,
  row_count    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_source_uploads_source
  ON data_source_uploads (tenant_id, source_id);

-- 每个数据源只保留一份最新表格（CSV 语义上一文件=一表），靠唯一索引保证幂等
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_source_uploads_source
  ON data_source_uploads (source_id);