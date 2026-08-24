// api/data-access/drivers/http.ts
// HTTP 通用连接器 - GET/POST，支持凭证注入（header / query / basic auth）

import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

const HTTP_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 1024 * 1024 // 1MB

function buildUrl(source: DataSource, pathOrFull: string): string {
  const cfg = source.config as Record<string, unknown>
  const base = (cfg.baseUrl as string) ?? ''
  // 如果传入完整 URL，只在白名单域名内允许
  if (pathOrFull.startsWith('http://') || pathOrFull.startsWith('https://')) {
    if (base) {
      const baseHost = new URL(base).hostname
      const reqHost = new URL(pathOrFull).hostname
      if (baseHost !== reqHost) {
        throw new Error('跨域名请求被禁止')
      }
    }
    return pathOrFull
  }
  const full = base.replace(/\/$/, '') + '/' + pathOrFull.replace(/^\//, '')
  return full
}

function injectAuth(
  headers: Record<string, string>,
  secret: Record<string, unknown>,
  url: URL,
): void {
  const type = secret.type as string | undefined
  switch (type) {
    case 'bearer_token': {
      const token = (secret.token as string) ?? ''
      if (token) headers['Authorization'] = `Bearer ${token}`
      break
    }
    case 'api_key': {
      const keyName = (secret.keyName as string) ?? 'X-API-Key'
      const keyValue = (secret.key as string) ?? ''
      const inQuery = secret.in === 'query'
      if (inQuery && keyValue) {
        url.searchParams.set(keyName, keyValue)
      } else if (keyValue) {
        headers[keyName] = keyValue
      }
      break
    }
    case 'basic_auth': {
      const user = (secret.username as string) ?? ''
      const pass = (secret.password as string) ?? ''
      if (user || pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
      }
      break
    }
    // custom 类型：不自动注入，由调用方在 headers 中自行处理
  }
}

export const httpDriver: DataSourceDriver = {
  kind: 'http',

  async test({ source, secret }) {
    const cfg = source.config as Record<string, unknown>
    const testUrl = (cfg.testPath as string) ?? (cfg.baseUrl as string) ?? ''
    if (!testUrl) throw new Error('缺少 baseUrl 或 testPath')
    const url = new URL(buildUrl(source, testUrl))
    const headers: Record<string, string> = { 'User-Agent': 'PlantFlow-DataAccess/1.0' }
    injectAuth(headers, secret, url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    } finally {
      clearTimeout(timer)
    }
  },

  async query({ source, secret, sqlOrReq: reqBody }) {
    const start = Date.now()
    const cfg = source.config as Record<string, unknown>
    // reqBody 为 JSON 字符串，形如 { "method": "GET", "path": "/api/data", "query": {...} }
    let req: { method?: string; path?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> }
    try {
      req = JSON.parse(reqBody)
    } catch {
      // 兼容纯 path 字符串
      req = { method: 'GET', path: reqBody }
    }
    const method = (req.method ?? 'GET').toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new Error('不支持的 HTTP 方法')
    }
    const url = new URL(buildUrl(source, req.path ?? ''))
    if (req.query) {
      for (const [k, v] of Object.entries(req.query)) {
        url.searchParams.set(k, String(v))
      }
    }
    const headers: Record<string, string> = {
      'User-Agent': 'PlantFlow-DataAccess/1.0',
      'Content-Type': 'application/json',
      ...(req.headers ?? {}),
    }
    injectAuth(headers, secret, url)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url.toString(), {
        method,
        headers,
        body: req.body && method !== 'GET' ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      })
      const text = await resp.text()
      // 限制响应大小
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error(`响应过大（超过 ${MAX_RESPONSE_BYTES} 字节）`)
      }
      let data: unknown = text
      try { data = JSON.parse(text) } catch { /* 非 JSON 保持字符串 */ }

      let rows: Record<string, unknown>[]
      if (Array.isArray(data)) {
        rows = data as Record<string, unknown>[]
      } else if (data && typeof data === 'object') {
        rows = [data as Record<string, unknown>]
      } else {
        rows = [{ value: data }]
      }
      return {
        columns: Object.keys(rows[0] ?? {}),
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - start,
      }
    } finally {
      clearTimeout(timer)
    }
  },
}
