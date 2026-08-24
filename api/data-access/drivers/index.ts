// api/data-access/drivers/index.ts
// 驱动注册中心（懒加载统一出口）

import type { DataSourceDriver } from '../types.js'
import { csvDriver } from './csv.js'
import { objectStorageDriver } from './object_storage.js'
import { postgresDriver } from './pg.js'
import { httpDriver } from './http.js'
import { oauthDriver } from './oauth.js'
import { apiKeyDriver } from './apikey.js'
import { spreadsheetDriver } from './spreadsheet.js'
import { emailDriver } from './email.js'
import { ossDriver } from './oss.js'

export const drivers: Record<string, DataSourceDriver> = {
  csv: csvDriver,
  object_storage: objectStorageDriver,
  postgres: postgresDriver,
  http: httpDriver,
  oauth: oauthDriver,
  apikey: apiKeyDriver,
  spreadsheet: spreadsheetDriver,
  email: emailDriver,
  oss: ossDriver,
}

export async function loadOptionalDriver(kind: string): Promise<DataSourceDriver | null> {
  if (kind === 'mysql') {
    try {
      const mod = await import('./mysql.js')
      return mod.mysqlDriver
    } catch (e) {
      console.warn('[data-access] mysql2 未安装，MySQL 数据源不可用:', e instanceof Error ? e.message : String(e))
      return null
    }
  }
  return null
}
