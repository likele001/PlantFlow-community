// api/data-access/index.ts
// N9 集中数据接入层 - 统一入口

import { db } from '../store.js'
import type { DataSource } from '../store.js'
import { drivers, loadOptionalDriver } from './drivers/index.js'
import type { DataSourceDriver, QueryResult } from './types.js'
import { SENSITIVE_COLUMNS } from './types.js'

// drivers 已由 drivers/index.ts 统一注册（含 N4 第二批 csv / object_storage）

export async function getDriver(kind: string): Promise<DataSourceDriver> {
  const d = drivers[kind]
  if (d) return d
  // 可选依赖驱动（mysql）
  const opt = await loadOptionalDriver(kind)
  if (opt) return opt
  if (kind === 'mysql') throw new Error('MySQL 驱动不可用（缺少 mysql2 依赖）')
  throw new Error(`不支持的数据源类型: ${kind}`)
}

/** 字段脱敏：按 field_allowlist 过滤，自动剔除敏感列 */
function applyFieldFilter(
  source: DataSource,
  result: QueryResult,
): QueryResult {
  const allowlist = source.fieldAllowlist ?? []
  const hasAllowlist = Array.isArray(allowlist) && allowlist.length > 0

  if (!hasAllowlist) {
    // 无白名单：自动剔除敏感列名
    const sensitiveLower = SENSITIVE_COLUMNS
    const keepColumns = result.columns.filter(
      c => !sensitiveLower.has(c.toLowerCase())
    )
    if (keepColumns.length === result.columns.length) return result
    const keepSet = new Set(keepColumns)
    return {
      columns: keepColumns,
      rows: result.rows.map(r => {
        const out: Record<string, unknown> = {}
        for (const k of keepColumns) out[k] = r[k]
        return out
      }),
      rowCount: result.rowCount,
      durationMs: result.durationMs,
    }
  }

  const allowSet = new Set(allowlist.map(s => s.toLowerCase()))
  const keepColumns = result.columns.filter(c => allowSet.has(c.toLowerCase()))
  return {
    columns: keepColumns,
    rows: result.rows.map(r => {
      const out: Record<string, unknown> = {}
      for (const k of keepColumns) out[k] = r[k]
      return out
    }),
    rowCount: result.rowCount,
    durationMs: result.durationMs,
  }
}

export async function getSourceSecret(
  tenantId: string,
  source: DataSource,
): Promise<Record<string, unknown>> {
  if (!source.credentialId) return {}
  const cred = await db.getDecryptedCredential(tenantId, source.credentialId)
  if (!cred) return {}
  return (cred.data as Record<string, unknown>) ?? {}
}

export async function testSource(
  tenantId: string,
  sourceId: string,
): Promise<void> {
  const source = await db.findDataSource(tenantId, sourceId)
  if (!source) throw new Error('数据源不存在')

  await db.setDataSourceStatus(tenantId, sourceId, 'testing')

  try {
    const driver = await getDriver(source.kind)
    const secret = await getSourceSecret(tenantId, source)
    await driver.test({ source, secret })
    await db.setDataSourceStatus(tenantId, sourceId, 'active')
    await db.insertDataAccessAudit({
      tenantId,
      sourceId,
      operation: 'test',
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.setDataSourceStatus(tenantId, sourceId, 'error', msg)
    await db.insertDataAccessAudit({
      tenantId,
      sourceId,
      operation: 'test',
      error: msg,
    })
    throw e
  }
}

export async function executeQuery(
  tenantId: string,
  sourceId: string,
  query: string,
  params?: unknown[],
  opts?: { userId?: string; skipAudit?: boolean },
): Promise<QueryResult> {
  const source = await db.findDataSource(tenantId, sourceId)
  if (!source) throw new Error('数据源不存在')
  if (!source.allowQuery) throw new Error('该数据源未开启查询权限')
  if (source.status !== 'active' && source.status !== 'testing') {
    throw new Error(`数据源未就绪（当前状态：${source.status}）`)
  }

  const driver = await getDriver(source.kind)
  const secret = await getSourceSecret(tenantId, source)

  const start = Date.now()
  let result: QueryResult | null = null
  let error: string | null = null
  try {
    result = await driver.query({ source, secret, sqlOrReq: query, params })
    // 字段白名单过滤 / 敏感列剔除
    result = applyFieldFilter(source, result)
    return result
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    if (!opts?.skipAudit) {
      await db.insertDataAccessAudit({
        tenantId,
        sourceId,
        userId: opts?.userId ?? null,
        operation: 'query',
        queryText: query.slice(0, 2000),
        rowCount: result?.rowCount ?? null,
        durationMs: Date.now() - start,
        error,
      }).catch(auditErr => {
        console.error('[data-access] audit failed', auditErr)
      })
    }
  }
}
