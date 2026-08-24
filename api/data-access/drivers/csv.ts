// api/data-access/drivers/csv.ts
// N4 第二批连接器 - CSV / XLSX 表格数据源
//
// 设计：
// 1. 数据本身存放在 data_source_uploads 表（rows JSONB + columns text[]）
// 2. test()：校验已存在上传记录即可视为「active」
// 3. query()：接收 SQL-like 字符串，支持三种语法
//    a) `SELECT * FROM data`                  —— 全表返回（限制 maxRows，默认 1000）
//    b) `SELECT col1, col2 FROM data WHERE col1 = 'x' LIMIT 10`
//    c) `{"filter":{"col":"value"},"limit":10}` —— JSON 形态
//    列名大小写不敏感；值比较 = 字符串相等（数值列可隐式比较）
// 4. XLSX 支持需可选依赖 xlsx 包；未安装则返回友好错误
// 5. driver 不读文件、不读 secrets（数据本身已经在 uploads 表里）

import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'
import { pool } from '../../db.js'

const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 5000

interface UploadRow {
  columns: string[]
  rows: Record<string, unknown>[]
}

async function loadUpload(tenantId: string, sourceId: string): Promise<UploadRow | null> {
  const r = await pool.query<{ columns: string[]; rows: Record<string, unknown>[] }>(
    `SELECT columns, rows FROM data_source_uploads
       WHERE tenant_id = $1 AND source_id = $2`,
    [tenantId, sourceId],
  )
  if (r.rowCount === 0) return null
  return { columns: r.rows[0].columns ?? [], rows: r.rows[0].rows ?? [] }
}

function coerce(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const s = String(v)
  // 数值识别（整数或浮点）
  if (/^-?\d+$/.test(s)) return Number(s)
  if (/^-?\d+\.\d+$/.test(s)) return Number(s)
  return s
}

// ===== SQL-like 解析 =====
// 极简 SELECT 解析：支持 * 或 逗号分隔列名；可选 WHERE col = 'val'（仅字符串字面量）；可选 LIMIT n
interface ParsedQuery {
  columns: string[] | '*'
  where: { col: string; value: string } | null
  limit: number
}

function parseSelectLike(input: string): ParsedQuery {
  const trimmed = input.trim()
  const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+\w+/i)
  if (!selectMatch) throw new Error('仅支持 SELECT * FROM data 或 SELECT col FROM data ... 语法')
  const colsRaw = selectMatch[1].trim()
  const columns: string[] | '*' = colsRaw === '*' ? '*' : colsRaw.split(',').map((s) => s.trim()).filter(Boolean)

  let where: { col: string; value: string } | null = null
  const whereMatch = trimmed.match(/WHERE\s+([\w."]+)\s*=\s*('([^']*)'|"([^"]*)")/i)
  if (whereMatch) {
    const col = whereMatch[1].replace(/["]/g, '').trim()
    const value = whereMatch[3] ?? whereMatch[4] ?? ''
    where = { col, value }
  }

  let limit = DEFAULT_LIMIT
  const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i)
  if (limitMatch) {
    const n = parseInt(limitMatch[1], 10)
    if (Number.isFinite(n) && n > 0) limit = Math.min(MAX_LIMIT, n)
  }
  return { columns, where, limit }
}

function parseJsonQuery(input: string): { filter: Record<string, unknown>; limit: number } {
  let obj: unknown
  try {
    obj = JSON.parse(input)
  } catch {
    throw new Error('JSON 查询语法无效')
  }
  if (!obj || typeof obj !== 'object') throw new Error('JSON 查询必须是对象')
  const o = obj as Record<string, unknown>
  const filter = (o.filter && typeof o.filter === 'object' ? (o.filter as Record<string, unknown>) : {})
  const limitRaw = Number(o.limit ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(MAX_LIMIT, Math.floor(limitRaw)) : DEFAULT_LIMIT
  return { filter, limit }
}

function applyQuery(upload: UploadRow, parsed: ParsedQuery): QueryResult {
  let rows = upload.rows

  if (parsed.where) {
    const colLower = parsed.where.col.toLowerCase()
    const valueLower = parsed.where.value.toLowerCase()
    rows = rows.filter((r) => {
      for (const k of Object.keys(r)) {
        if (k.toLowerCase() === colLower) {
          return String(r[k] ?? '').toLowerCase() === valueLower
        }
      }
      return false
    })
  }

  const cols = parsed.columns === '*' ? upload.columns : parsed.columns.map((c) => {
    const want = c.toLowerCase()
    const hit = upload.columns.find((uc) => uc.toLowerCase() === want)
    if (!hit) throw new Error(`列不存在: ${c}`)
    return hit
  })

  const limited = rows.slice(0, parsed.limit).map((r) => {
    const out: Record<string, unknown> = {}
    for (const c of cols) out[c] = r[c]
    return out
  })

  return {
    columns: cols,
    rows: limited,
    rowCount: limited.length,
    durationMs: 0,
  }
}

function applyJsonQuery(upload: UploadRow, q: { filter: Record<string, unknown>; limit: number }): QueryResult {
  const filters = Object.entries(q.filter).map(([k, v]) => ({ col: k.toLowerCase(), value: coerce(v) }))
  const rows = upload.rows.filter((r) => {
    for (const f of filters) {
      let actual: unknown = undefined
      for (const k of Object.keys(r)) {
        if (k.toLowerCase() === f.col) { actual = r[k]; break }
      }
      if (coerce(actual) !== f.value) return false
    }
    return true
  })
  const limited = rows.slice(0, q.limit)
  return {
    columns: upload.columns,
    rows: limited,
    rowCount: limited.length,
    durationMs: 0,
  }
}

export const csvDriver: DataSourceDriver = {
  kind: 'csv',

  async test({ source }) {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM data_source_uploads WHERE source_id = $1 LIMIT 1`,
      [source.id],
    )
    if (r.rowCount === 0) throw new Error('尚未上传表格文件')
  },

  async query({ source, sqlOrReq }) {
    const start = Date.now()
    const tenantId = (source as unknown as { tenantId?: string }).tenantId
    if (!tenantId) throw new Error('数据源缺少 tenantId')
    const upload = await loadUpload(tenantId, source.id)
    if (!upload) throw new Error('尚未上传表格文件')
    if (upload.rows.length === 0) {
      return { columns: upload.columns, rows: [], rowCount: 0, durationMs: Date.now() - start }
    }

    // 优先 JSON 形态（以 { 开头）
    const trimmed = sqlOrReq.trim()
    let result: QueryResult
    if (trimmed.startsWith('{')) {
      const q = parseJsonQuery(trimmed)
      result = applyJsonQuery(upload, q)
    } else {
      const parsed = parseSelectLike(trimmed)
      result = applyQuery(upload, parsed)
    }
    result.durationMs = Date.now() - start
    return result
  },
}