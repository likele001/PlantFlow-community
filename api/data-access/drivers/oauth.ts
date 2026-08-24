// api/data-access/drivers/oauth.ts
// N4.4 通用第三方 OAuth2 连接器（client_credentials 模板）
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

const TIMEOUT = 12000

type OAuthSecret = { clientId?: string; clientSecret?: string }
type OAuthCfg = { baseUrl?: string; tokenPath?: string; scope?: string; grantType?: string }

async function fetchToken(source: DataSource, secret: Record<string, unknown>): Promise<string> {
  const cfg = source.config as OAuthCfg
  const base = String(cfg.baseUrl ?? '').replace(/\/$/, '')
  if (!base) throw new Error('缺少 baseUrl')
  const tokenPath = cfg.tokenPath ?? '/oauth/token'
  const grant = cfg.grantType ?? 'client_credentials'
  const body = new URLSearchParams()
  body.set('grant_type', grant)
  if (cfg.scope) body.set('scope', String(cfg.scope))
  if (grant === 'client_credentials') {
    body.set('client_id', String(secret.clientId ?? ''))
    body.set('client_secret', String(secret.clientSecret ?? ''))
  }
  const r = await fetch(base + tokenPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) throw new Error('OAuth 令牌获取失败: HTTP ' + r.status)
  const j = (await r.json()) as { access_token?: string }
  if (!j.access_token) throw new Error('OAuth 响应缺少 access_token')
  return j.access_token
}

export const oauthDriver: DataSourceDriver = {
  kind: 'oauth',
  async test({ source, secret }) {
    await fetchToken(source, secret)
  },
  async query({ source, secret, sqlOrReq }): Promise<QueryResult> {
    const start = Date.now()
    const token = await fetchToken(source, secret)
    let req: { method?: string; path?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> }
    try { req = JSON.parse(sqlOrReq) } catch { req = { method: 'GET', path: sqlOrReq } }
    const cfg = source.config as OAuthCfg
    const base = String(cfg.baseUrl ?? '').replace(/\/$/, '')
    const url = new URL(base + (req.path ?? ''))
    if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, String(v))
    const r = await fetch(url.toString(), {
      method: (req.method ?? 'GET').toUpperCase(),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(req.headers ?? {}) },
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
