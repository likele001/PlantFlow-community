// api/data-access/drivers/spreadsheet.ts
// N4.5 表格导入（CSV/XLSX）解析为数据源
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'
import * as XLSX from 'xlsx'

type SSCfg = { mode?: 'url' | 'text'; url?: string; text?: string; sheet?: string; maxRows?: number }

async function loadBuffer(source: DataSource): Promise<Buffer> {
  const cfg = source.config as SSCfg
  const mode = cfg.mode ?? 'url'
  if (mode === 'text') {
    if (!cfg.text) throw new Error('缺少 text 内容')
    return Buffer.from(cfg.text, 'utf-8')
  }
  if (!cfg.url) throw new Error('缺少 url')
  const r = await fetch(String(cfg.url), { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('表格下载失败: HTTP ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}

export const spreadsheetDriver: DataSourceDriver = {
  kind: 'spreadsheet',
  async test({ source }) {
    await loadBuffer(source)
  },
  async query({ source, sqlOrReq }): Promise<QueryResult> {
    const start = Date.now()
    const buf = await loadBuffer(source)
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheetName = (source.config as SSCfg).sheet || wb.SheetNames[0]
    if (!sheetName) throw new Error('工作簿为空或无工作表')
    const ws = wb.Sheets[sheetName]
    if (!ws) throw new Error('工作表不存在: ' + sheetName)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
    const max = (source.config as SSCfg).maxRows ?? 1000
    const limited = rows.slice(0, max)
    return {
      columns: limited[0] ? Object.keys(limited[0]) : [],
      rows: limited,
      rowCount: limited.length,
      durationMs: Date.now() - start,
    }
  },
}
