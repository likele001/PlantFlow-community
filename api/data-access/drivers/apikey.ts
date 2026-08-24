// api/data-access/drivers/apikey.ts
// N4.4 通用 API Key 连接器模板
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

const TIMEOUT = 12000

type ApiKeySecret = { apiKey?: string; keyName?: string; in?: 'header' | 'query' }
type ApiKeyCfg = { baseUrl?: string; keyName?: string; in?: 'header' | 'query' }

export const apiKeyDriver: DataSourceDriver = {
  kind: 'apikey',
  async test({ source, secret }) {
    const cfg = source.config as ApiKeyCfg
    const base = String(cfg.baseUrl ?? '').replace(/\/$/, '')
    if (!base) throw new Error('缺少 baseUrl')
    const keyName = cfg.keyName ?? (secret.keyName as string) ?? 'X-API-Key'
    const inQuery = (cfg.in ?? (secret.in as string)) === 'query'
    const url = new URL(base)
    if (inQuery && secret.apiKey) url.searchParams.set(keyName, String(secret.apiKey))
    const headers: Record<string, string> = {}
    if (!inQuery && secret.apiKey) headers[keyName] = String(secret.apiKey)
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT), headers })
    if (!r.ok) throw new Error('API Key 连接测试失败: HTTP ' + r.status)
  },
  async query({ source, secret, sqlOrReq }): Promise<QueryResult> {
    const start = Date.now()
    let req: { method?: string; path?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> }
    try { req = JSON.parse(sqlOrReq) } catch { req = { method: 'GET', path: sqlOrReq } }
    const cfg = source.config as ApiKeyCfg
    const base = String(cfg.baseUrl ?? '').replace(/\/$/, '')
    const url = new URL(base + (req.path ?? ''))
    if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, String(v))
    const keyName = cfg.keyName ?? (secret.keyName as string) ?? 'X-API-Key'
    const inQuery = (cfg.in ?? (secret.in as string)) === 'query'
    if (inQuery && secret.apiKey) url.searchParams.set(keyName, String(secret.apiKey))
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(req.headers ?? {}) }
    if (!inQuery && secret.apiKey) headers[keyName] = String(secret.apiKey)
    const r = await fetch(url.toString(), {
      method: (req.method ?? 'GET').toUpperCase(),
      headers,
      body: req.body && (req.method ?? 'GET').toUpperCase() !== 'GET' ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const text = await r.text()
    let data: unknown = text
    try { data = JSON.parse(text) } catch {}
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [data as Record<string, unknown>]
    return { columns: Object.keys(rows[0] ?? {}), rows, rowCount: rows.length, durationMs: Date.now() - start }
  },
}
