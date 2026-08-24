import type { NextFunction, Request, Response } from 'express'

// 内存滑动窗口限流（单实例足够；workflow-api 为单容器部署）
let nsCounter = 0
type Bucket = number[]
const buckets = new Map<string, Bucket>()

function sweep(now: number, keepMs: number) {
  for (const [k, arr] of buckets) {
    const kept = arr.filter((t) => now - t < keepMs)
    if (kept.length) buckets.set(k, kept)
    else buckets.delete(k)
    if (buckets.size > 20_000) buckets.clear()
  }
}
// 定时清理空桶，避免内存无限增长；unref 避免阻止进程退出
setInterval(() => sweep(Date.now(), 5 * 60_000), 5 * 60_000).unref()

export interface RateLimitOptions {
  windowMs: number
  max: number
  key?: (req: Request) => string
}

export const keyFromIp = (req: Request): string =>
  req.ip ?? req.socket.remoteAddress ?? 'unknown'

// 按 IP + URL 区分（公开 webhook 各自独立配额）
export const keyFromIpUrl = (req: Request): string =>
  `${keyFromIp(req)}|${req.originalUrl ?? req.url}`

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max } = opts
  const keyOf = opts.key ?? keyFromIp
  // 每个实例独立命名空间，避免多实例共用同一桶互相叠加计数
  const namespace = ++nsCounter
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const raw = keyOf(req)
    const key = `${namespace}:${raw.length > 200 ? raw.slice(0, 200) : raw}`
    let arr = buckets.get(key)
    if (!arr) {
      arr = []
      buckets.set(key, arr)
    }
    const kept = arr.filter((t) => now - t < windowMs)
    arr.length = 0
    arr.push(...kept)
    if (arr.length >= max) {
      res.status(429).json({ success: false, error: '请求过于频繁，请稍后再试' })
      return
    }
    arr.push(now)
    next()
  }
}