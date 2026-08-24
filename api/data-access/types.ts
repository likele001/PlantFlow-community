// api/data-access/types.ts
// N9 数据接入层 - 公共类型

import type { DataSource } from '../store.js'

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

export interface DataSourceDriver {
  kind: DataSource['kind']
  test(ctx: { source: DataSource; secret: Record<string, unknown> }): Promise<void>
  query(ctx: {
    source: DataSource
    secret: Record<string, unknown>
    sqlOrReq: string
    params?: unknown[]
  }): Promise<QueryResult>
}

export const SENSITIVE_COLUMNS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'access_key', 'accesskey', 'private_key', 'privatekey', 'auth',
  'authorization', 'cookie', 'session', 'ssn', 'credit_card', 'card_number',
  'phone', 'mobile', 'email', 'id_card', 'idcard',
])
