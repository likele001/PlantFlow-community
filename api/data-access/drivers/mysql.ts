// api/data-access/drivers/mysql.ts
// MySQL 只读驱动 - 使用 mysql2

import mysql from 'mysql2/promise'
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

const QUERY_TIMEOUT_MS = 5000
const MAX_ROWS = 1000

function buildConfig(source: DataSource, secret: Record<string, unknown>): mysql.ConnectionOptions {
  const cfg = source.config as Record<string, unknown>
  return {
    host: (cfg.host as string) ?? '127.0.0.1',
    port: Number(cfg.port ?? 3306),
    database: (cfg.database as string) ?? '',
    user: (secret.user as string) ?? (cfg.user as string) ?? 'root',
    password: (secret.password as string) ?? '',
    // 禁多语句
    multipleStatements: false,
  }
}

function validateReadOnly(sql: string): void {
  const trimmed = sql.trim()
  if (!trimmed) throw new Error('SQL 不能为空')
  const upper = trimmed.toUpperCase()
  // 允许 SELECT 或 WITH 开头
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('SHOW') && !upper.startsWith('DESCRIBE') && !upper.startsWith('DESC') && !upper.startsWith('EXPLAIN')) {
    throw new Error('仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询')
  }
  // 拒绝多语句
  if (/;\s*\S/.test(trimmed.replace(/;\s*$/, ''))) {
    throw new Error('不允许多语句查询')
  }
}

export const mysqlDriver: DataSourceDriver = {
  kind: 'mysql',

  async test({ source, secret }) {
    const conn = await mysql.createConnection(buildConfig(source, secret))
    try {
      await conn.query('SELECT 1 AS ok')
    } finally {
      await conn.end().catch(() => {})
    }
  },

  async query({ source, secret, sqlOrReq, params }) {
    const start = Date.now()
    validateReadOnly(sqlOrReq)
    const conn = await mysql.createConnection(buildConfig(source, secret))
    try {
      // 强制 LIMIT 兜底
      const sql = sqlOrReq.trim().replace(/;?\s*$/, '') + `\nLIMIT ${MAX_ROWS}`
      // 超时控制
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          conn.destroy()
          reject(new Error(`查询超时（${QUERY_TIMEOUT_MS}ms）`))
        }, QUERY_TIMEOUT_MS)
      })
      const queryPromise = conn.query(sql, params ?? []).then(([rows, fields]) => {
        if (timeoutId) clearTimeout(timeoutId)
        return [rows, fields] as const
      })
      const [rows, fields] = await Promise.race([queryPromise, timeoutPromise])
      const rowArr = Array.isArray(rows) ? rows as Record<string, unknown>[] : []
      const columns = Array.isArray(fields)
        ? (fields as mysql.FieldPacket[]).map(f => f.name)
        : (rowArr[0] ? Object.keys(rowArr[0]) : [])
      return {
        columns,
        rows: rowArr,
        rowCount: rowArr.length,
        durationMs: Date.now() - start,
      }
    } finally {
      await conn.end().catch(() => {})
    }
  },
}
