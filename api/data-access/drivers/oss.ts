// api/data-access/drivers/oss.ts
// N4.6 云存储连接器（OSS / COS / S3 兼容）
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

type OssCfg = { region?: string; bucket?: string; endpoint?: string }
type OssSecret = { accessKeyId?: string; secretAccessKey?: string }

function makeClient(source: DataSource, secret: Record<string, unknown>): S3Client {
  const cfg = source.config as OssCfg
  return new S3Client({
    region: String(cfg.region ?? 'us-east-1'),
    endpoint: cfg.endpoint ? String(cfg.endpoint) : undefined,
    credentials: { accessKeyId: String(secret.accessKeyId ?? ''), secretAccessKey: String(secret.secretAccessKey ?? '') },
    forcePathStyle: Boolean(cfg.endpoint),
  })
}

export const ossDriver: DataSourceDriver = {
  kind: 'oss',
  async test({ source, secret }) {
    const cfg = source.config as OssCfg
    if (!cfg.bucket) throw new Error('缺少 bucket')
    const c = makeClient(source, secret)
    await c.send(new ListObjectsV2Command({ Bucket: String(cfg.bucket), MaxKeys: 1 }))
  },
  async query({ source, secret, sqlOrReq }): Promise<QueryResult> {
    const start = Date.now()
    const cfg = source.config as OssCfg
    let req: { op?: string; key?: string; prefix?: string; content?: string }
    try { req = JSON.parse(sqlOrReq) } catch { throw new Error('oss 查询体需为 JSON { op:"list"|"get"|"put", ... }') }
    const c = makeClient(source, secret)
    const bucket = String(cfg.bucket)
    const op = req.op ?? 'list'
    if (op === 'list') {
      const out = await c.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: req.prefix ?? '' }))
      const rows = (out.Contents ?? []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified?.toISOString() }))
      return { columns: ['key', 'size', 'lastModified'], rows, rowCount: rows.length, durationMs: Date.now() - start }
    }
    if (op === 'get') {
      if (!req.key) throw new Error('缺少 key')
      const out = await c.send(new GetObjectCommand({ Bucket: bucket, Key: req.key }))
      const body = await out.Body?.transformToString()
      const rows = [{ key: req.key, content: body }]
      return { columns: ['key', 'content'], rows, rowCount: rows.length, durationMs: Date.now() - start }
    }
    if (op === 'put') {
      if (!req.key) throw new Error('缺少 key')
      await c.send(new PutObjectCommand({ Bucket: bucket, Key: req.key, Body: req.content ?? '' }))
      const rows = [{ ok: true, key: req.key }]
      return { columns: ['ok', 'key'], rows, rowCount: rows.length, durationMs: Date.now() - start }
    }
    throw new Error('不支持的 op，支持 list/get/put')
  },
}
