// api/data-access/drivers/object_storage.ts
// N4 第二批连接器 - S3 兼容对象存储（OSS / COS / S3 / MinIO）
//
// 设计：
// 1. 数据源 config: { endpoint, region, bucket, forcePathStyle }
// 2. secret: { accessKeyId, secretAccessKey } —— 必须用 credential 存储
// 3. lazy load `minio` 包；如未安装则 test() / query() 返回明确错误，告知 npm i minio
// 4. query 接收 JSON 字符串：
//    a) {"op":"list","prefix":"","recursive":false}              —— 列出对象
//    b) {"op":"get","key":"file.csv","maxBytes":1048576}        —— 下载对象（CSV 解析返 rows）
//    c) {"op":"stat","key":"file.csv"}                          —— 单对象元信息
// 5. CSV 自动识别：根据后缀 .csv 触发内联 CSV 解析；非 CSV 返回 preview 字段

import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'

interface ObjectStorageConfig {
  endpoint?: string
  region?: string
  bucket?: string
  forcePathStyle?: boolean
}

type MinioClient = {
  listObjectsV2(bucket: string, prefix: string, recursive: boolean, startAfter?: string): Promise<{
    objects?: Array<{ name?: string; size?: number; lastModified?: Date; etag?: string }>
    isTruncated?: boolean
    nextContinuationToken?: string
  }>
  statObject(bucket: string, key: string): Promise<{ size: number; etag: string; lastModified: Date; metaData?: Record<string, string> }>
  getObject(bucket: string, key: string): Promise<NodeJS.ReadableStream>
}

interface MinioCtorType {
  new (config: Record<string, unknown>): MinioClient
}

let minioLoadTried = false
let MinioCtor: MinioCtorType | null = null

async function loadMinio(): Promise<MinioCtorType | null> {
  if (minioLoadTried) return MinioCtor
  minioLoadTried = true
  try {
    // @ts-expect-error 可选依赖 minio，未安装时走 catch 分支
    const mod = (await import('minio')) as unknown as { Client: MinioCtorType }
    MinioCtor = mod.Client
    return MinioCtor
  } catch (e) {
    console.warn('[object_storage] minio 未安装，云存储数据源不可用:', e instanceof Error ? e.message : String(e))
    return null
  }
}

function buildClient(cfg: ObjectStorageConfig, secret: Record<string, unknown>): MinioClient {
  if (!MinioCtor) throw new Error('对象存储驱动依赖未安装，请联系管理员执行 npm i minio')
  const endpoint = cfg.endpoint ?? ''
  if (!endpoint) throw new Error('缺少 endpoint（形如 https://oss-cn-hangzhou.aliyuncs.com）')
  const region = cfg.region ?? 'us-east-1'
  const accessKey = String(secret.accessKeyId ?? secret.accessKey ?? '')
  const secretKey = String(secret.secretAccessKey ?? secret.secretKey ?? '')
  if (!accessKey || !secretKey) throw new Error('缺少 accessKeyId / secretAccessKey（请在 credential 中配置）')
  return new MinioCtor({
    endPoint: new URL(endpoint).hostname,
    port: new URL(endpoint).port ? parseInt(new URL(endpoint).port, 10) : (endpoint.startsWith('https') ? 443 : 80),
    useSSL: endpoint.startsWith('https'),
    region,
    accessKey,
    secretKey,
    pathStyle: cfg.forcePathStyle === true,
  })
}

// 简易 CSV 解析（驱动侧，避免跨依赖）
function parseCsvRows(buf: Buffer): { columns: string[]; rows: Record<string, unknown>[] } {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
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
  const columns = (lines[0] ?? []).map((c) => c.trim())
  const rows = lines.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => {
    const out: Record<string, unknown> = {}
    columns.forEach((c, i) => { out[c] = r[i] ?? null })
    return out
  })
  return { columns, rows }
}

export const objectStorageDriver: DataSourceDriver = {
  kind: 'object_storage',

  async test({ source, secret }) {
    await loadMinio()
    const cfg = source.config as ObjectStorageConfig
    if (!cfg.bucket) throw new Error('缺少 bucket')
    const client = buildClient(cfg, secret)
    // 列出最多 1 个对象验证连通 + 凭证有效
    const r = await client.listObjectsV2(cfg.bucket, '', false)
    void r
  },

  async query({ source, secret, sqlOrReq }) {
    const start = Date.now()
    await loadMinio()
    const cfg = source.config as ObjectStorageConfig
    if (!cfg.bucket) throw new Error('缺少 bucket')
    const client = buildClient(cfg, secret)

    let req: { op?: string; prefix?: string; recursive?: boolean; key?: string; maxBytes?: number }
    try {
      req = JSON.parse(sqlOrReq)
    } catch {
      throw new Error('object_storage 查询必须是 JSON：{"op":"list|get|stat", ...}')
    }
    const op = (req.op ?? '').toLowerCase()
    const maxBytes = Math.min(Number(req.maxBytes ?? 1048576), 5 * 1024 * 1024)

    if (op === 'list') {
      const r = await client.listObjectsV2(cfg.bucket, req.prefix ?? '', req.recursive === true)
      const rows = (r.objects ?? []).map((o) => ({
        key: o.name ?? '',
        size: typeof o.size === 'number' ? o.size : null,
        lastModified: o.lastModified instanceof Date ? o.lastModified.toISOString() : null,
        etag: (o.etag ?? '').replace(/"/g, ''),
      }))
      return { columns: ['key', 'size', 'lastModified', 'etag'], rows, rowCount: rows.length, durationMs: Date.now() - start }
    }

    if (op === 'stat') {
      const key = req.key ?? ''
      if (!key) throw new Error('缺少 key')
      const meta = await client.statObject(cfg.bucket, key)
      return {
        columns: ['key', 'size', 'lastModified', 'etag'],
        rows: [{
          key,
          size: meta.size,
          lastModified: meta.lastModified instanceof Date ? meta.lastModified.toISOString() : null,
          etag: (meta.etag ?? '').replace(/"/g, ''),
        }],
        rowCount: 1,
        durationMs: Date.now() - start,
      }
    }

    if (op === 'get') {
      const key = req.key ?? ''
      if (!key) throw new Error('缺少 key')
      const stream = await client.getObject(cfg.bucket, key)
      const chunks: Buffer[] = []
      let received = 0
      let truncated = false
      for await (const chunk of stream) {
        const buf = chunk as Buffer
        received += buf.length
        if (received > maxBytes) {
          chunks.push(buf.subarray(0, maxBytes - (received - buf.length)))
          truncated = true
          break
        }
        chunks.push(buf)
      }
      const buf = Buffer.concat(chunks)
      const lower = key.toLowerCase()
      if (lower.endsWith('.csv')) {
        const { columns, rows } = parseCsvRows(buf)
        return { columns, rows: rows.slice(0, 1000), rowCount: rows.length, durationMs: Date.now() - start }
      }
      return {
        columns: ['key', 'size', 'truncated', 'preview'],
        rows: [{ key, size: received, truncated, preview: buf.toString('utf8').slice(0, 4000) }],
        rowCount: 1,
        durationMs: Date.now() - start,
      }
    }

    throw new Error(`不支持的 op: ${op}（支持 list / get / stat）`)
  },
}