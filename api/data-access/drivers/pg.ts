// api/data-access/drivers/pg.ts
// PostgreSQL 只读驱动 - 复用项目已有的 pg 依赖

import pg from 'pg'
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

const STATEMENT_TIMEOUT_MS = 5000
const MAX_ROWS = 1000

function buildConnString(source: DataSource, secret: Record<string, unknown>): string {
  const cfg = source.config as Record<string, unknown>
  const host = cfg.host ?? '127.0.0.1'
  const port = cfg.port ?? 5432
  const database = cfg.database ?? 'postgres'
  const user = (secret.user as string) ?? (cfg.user as string) ?? 'postgres'
  const password = (secret.password as string) ?? ''
  const pw = password ? encodeURIComponent(password) : ''
  return `postgresql://${encodeURIComponent(user)}:${pw}@${host}:${port}/${database}?options=-c%20default_transaction_read_only%3Don&statement_timeout=${STATEMENT_TIMEOUT_MS}`
}

function validateReadOnly(sql: string): void {
  const trimmed = sql.trim()
  if (!trimmed) throw new Error('SQL 不能为空')
  const upper = trimmed.toUpperCase()
  // 允许 SELECT 或 WITH 开头（CTE + SELECT）
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('仅允许 SELECT 查询')
  }
  // 拒绝多语句（防止注入）
  if (/;\s*\S/.test(trimmed.replace(/;\s*$/, ''))) {
    throw new Error('不允许多语句查询')
  }
}

export const postgresDriver: DataSourceDriver = {
  kind: 'postgres',

  async test({ source, secret }) {
    const connStr = buildConnString(source, secret)
    const client = new pg.Client({ connectionString: connStr })
    try {
      await client.connect()
      await client.query('SELECT 1 AS ok')
    } finally {
      await client.end().catch(() => {})
    }
  },

  async query({ source, secret, sqlOrReq, params }) {
    const start = Date.now()
    validateReadOnly(sqlOrReq)
    const connStr = buildConnString(source, secret)
    const client = new pg.Client({ connectionString: connStr })
    try {
      await client.connect()
      // 强制 LIMIT 兜底
      const sql = sqlOrReq.trim().replace(/;?\s*$/, '') + `\nLIMIT ${MAX_ROWS}`
      const result = await client.query(sql, params ?? [])
      const columns = result.fields.map(f => f.name)
      const rows = result.rows as Record<string, unknown>[]
      return {
        columns,
        rows,
        rowCount: result.rowCount ?? rows.length,
        durationMs: Date.now() - start,
      }
    } finally {
      await client.end().catch(() => {})
    }
  },
}
