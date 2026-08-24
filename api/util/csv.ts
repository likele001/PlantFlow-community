// api/util/csv.ts
// N4 - 共享 CSV 解析工具（RFC4180 兼容）
// 支持 quoted fields、escape ""、嵌入换行

export interface ParsedCsv {
  columns: string[]
  rows: Record<string, unknown>[]
}

/**
 * 解析 CSV 字节（自动去 BOM）。列名按表头自动 trim + 去重。
 */
export function parseCsv(buf: Buffer | string): ParsedCsv {
  const text = typeof buf === 'string' ? buf : buf.toString('utf8').replace(/^\uFEFF/, '')
  const lines: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else cur += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n') { row.push(cur); lines.push(row); row = []; cur = '' }
      else if (ch === '\r') { /* skip */ }
      else cur += ch
    }
  }
  if (cur !== '' || row.length) { row.push(cur); lines.push(row) }

  if (lines.length === 0) return { columns: [], rows: [] }
  const rawColumns = (lines[0] ?? []).map((c) => c.trim())
  // 列名去重
  const seen = new Map<string, number>()
  const columns = rawColumns.map((c) => {
    const base = c || 'col'
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
  const dataRows = lines.slice(1).filter((r) => r.some((c) => c !== ''))
  const rows = dataRows.map((r) => {
    const out: Record<string, unknown> = {}
    columns.forEach((c, i) => { out[c] = r[i] ?? null })
    return out
  })
  return { columns, rows }
}