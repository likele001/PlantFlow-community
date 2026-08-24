// api/routes/data-access.ts
// N9 数据接入层 - HTTP API

import { Router, type Response } from 'express'
import multer from 'multer'
import { db, type DataSource } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { executeQuery, testSource } from '../data-access/index.js'
import { pool } from '../db.js'
import { parseCsv } from '../util/csv.js'

const r = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

function ok(res: Response, data: unknown) {
  res.json({ success: true, data })
}
function bad(res: Response, error: string, code = 400) {
  res.status(code).json({ success: false, error })
}

const VALID_KINDS = ['mysql', 'postgres', 'http', 'csv', 'object_storage', 'oauth', 'apikey', 'spreadsheet', 'email', 'oss'] as const

// ===== 数据源 CRUD =====

r.get('/sources', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const list = await db.listDataSources(req.auth!.tenantId)
    // 返回时不暴露 config 里的敏感信息（敏感的都在 credential 里，这里直接返回）
    ok(res, list)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.get('/sources/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ds = await db.findDataSource(req.auth!.tenantId, req.params.id)
    if (!ds) return bad(res, '数据源不存在', 404)
    ok(res, ds)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.post('/sources', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { name, kind, config, credentialId, fieldAllowlist, allowQuery } =
      (req.body ?? {}) as {
        name?: string
        kind?: DataSource['kind']
        config?: Record<string, unknown>
        credentialId?: string | null
        fieldAllowlist?: string[]
        allowQuery?: boolean
      }
    if (!name?.trim()) return bad(res, 'name 为必填')
    if (!kind || !VALID_KINDS.includes(kind)) {
      return bad(res, `kind 无效，支持: ${VALID_KINDS.join(', ')}`)
    }
    if (config !== undefined && typeof config !== 'object') {
      return bad(res, 'config 必须是对象')
    }
    if (fieldAllowlist !== undefined && !Array.isArray(fieldAllowlist)) {
      return bad(res, 'fieldAllowlist 必须是字符串数组')
    }
    const ds = await db.createDataSource(req.auth!.tenantId, {
      name: name.trim(),
      kind,
      config: config ?? {},
      credentialId: credentialId ?? null,
      fieldAllowlist: fieldAllowlist ?? [],
      allowQuery: allowQuery !== false,
    })
    ok(res, ds)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.patch('/sources/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const patch = req.body ?? {}
    const ds = await db.updateDataSource(req.auth!.tenantId, req.params.id, patch)
    if (!ds) return bad(res, '数据源不存在', 404)
    ok(res, ds)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.delete('/sources/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const okDel = await db.deleteDataSource(req.auth!.tenantId, req.params.id)
    if (!okDel) return bad(res, '数据源不存在', 404)
    ok(res, { deleted: true })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

// ===== 测试连接 =====

// ===== 表格上传（仅 csv 类型） =====
r.post('/sources/:id/upload', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    const source = await db.findDataSource(req.auth!.tenantId, req.params.id)
    if (!source) return bad(res, '数据源不存在', 404)
    if (source.kind !== 'csv') return bad(res, '仅 csv 类型数据源支持表格上传', 400)
    const file = (req as unknown as { file?: Express.Multer.File }).file
    if (!file) return bad(res, '缺少 file 字段')

    const ext = file.originalname.toLowerCase().split('.').pop() ?? ''
    let columns: string[] = []
    let rows: Record<string, unknown>[] = []

    if (ext === 'csv' || ext === 'txt') {
      const parsed = parseCsv(file.buffer)
      columns = parsed.columns
      rows = parsed.rows
    } else if (ext === 'xlsx' || ext === 'xls') {
      // XLSX 支持需可选依赖 xlsx（SheetJS），未安装返回友好错误
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(file.buffer, { type: 'buffer' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) return bad(res, 'XLSX 文件无 sheet')
        const sheet = wb.Sheets[sheetName]
        const arr = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[]
        columns = arr.length ? Object.keys(arr[0]) : []
        rows = arr
      } catch (e) {
        return bad(res, 'XLSX 解析需要安装 xlsx 包（npm i xlsx）：' + (e instanceof Error ? e.message : String(e)))
      }
    } else {
      return bad(res, `不支持的文件类型 .${ext}（仅 csv / txt / xlsx / xls）`)
    }

    // upsert：每个 source 只保留一份最新
    await pool.query(
      `INSERT INTO data_source_uploads (tenant_id, source_id, filename, mime_type, byte_size, rows, columns, row_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (source_id) DO UPDATE SET
         filename = EXCLUDED.filename,
         mime_type = EXCLUDED.mime_type,
         byte_size = EXCLUDED.byte_size,
         rows = EXCLUDED.rows,
         columns = EXCLUDED.columns,
         row_count = EXCLUDED.row_count,
         updated_at = now()`,
      [
        req.auth!.tenantId,
        source.id,
        file.originalname,
        file.mimetype || 'application/octet-stream',
        file.size,
        JSON.stringify(rows),
        columns,
        rows.length,
      ],
    )

    // 标记为 active
    await db.setDataSourceStatus(req.auth!.tenantId, source.id, 'active')

    ok(res, { columns, rowCount: rows.length, filename: file.originalname, byteSize: file.size })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Upload failed')
  }
})

r.get('/sources/:id/sample', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const source = await db.findDataSource(req.auth!.tenantId, req.params.id)
    if (!source) return bad(res, '数据源不存在', 404)
    if (source.kind !== 'csv') return bad(res, '仅 csv 类型支持 sample', 400)
    const r2 = await pool.query<{ columns: string[]; rows: Record<string, unknown>[]; row_count: number; filename: string }>(
      `SELECT columns, rows, row_count, filename FROM data_source_uploads WHERE tenant_id = $1 AND source_id = $2`,
      [req.auth!.tenantId, source.id],
    )
    if (r2.rowCount === 0) return bad(res, '尚未上传', 404)
    const u = r2.rows[0]
    ok(res, { columns: u.columns, rowCount: u.row_count, filename: u.filename, preview: (u.rows ?? []).slice(0, 5) })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Sample failed')
  }
})

r.post('/sources/:id/test', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await testSource(req.auth!.tenantId, req.params.id)
    ok(res, { ok: true })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Test failed')
  }
})

// ===== 统一查询入口 =====

r.post('/query', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { sourceId, query, params } = (req.body ?? {}) as {
      sourceId?: string
      query?: string
      params?: unknown[]
    }
    if (!sourceId) return bad(res, 'sourceId 为必填')
    if (!query || typeof query !== 'string') return bad(res, 'query 为必填字符串')

    const result = await executeQuery(req.auth!.tenantId, sourceId, query, params, {
      userId: req.auth!.userId,
    })
    ok(res, result)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Query failed')
  }
})

export default r
