// === O4: Cron 可视化与时区支持 ===
import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import type { Response } from 'express'
import { db } from '../store.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePerm } from '../middleware/rbac.js'

const router = Router()

// 常见 IANA 时区列表（前端下拉）
const TIMEZONES: { value: string; label: string; offset: string }[] = [
  { value: 'Pacific/Honolulu', label: '檀香山', offset: '-10:00' },
  { value: 'America/Anchorage', label: '阿拉斯加', offset: '-09:00' },
  { value: 'America/Los_Angeles', label: '洛杉矶', offset: '-08:00' },
  { value: 'America/Denver', label: '丹佛', offset: '-07:00' },
  { value: 'America/Chicago', label: '芝加哥', offset: '-06:00' },
  { value: 'America/New_York', label: '纽约', offset: '-05:00' },
  { value: 'America/Sao_Paulo', label: '圣保罗', offset: '-03:00' },
  { value: 'Europe/London', label: '伦敦', offset: '+00:00' },
  { value: 'Europe/Berlin', label: '柏林', offset: '+01:00' },
  { value: 'Europe/Athens', label: '雅典', offset: '+02:00' },
  { value: 'Asia/Dubai', label: '迪拜', offset: '+04:00' },
  { value: 'Asia/Karachi', label: '卡拉奇', offset: '+05:00' },
  { value: 'Asia/Kolkata', label: '加尔各答', offset: '+05:30' },
  { value: 'Asia/Bangkok', label: '曼谷', offset: '+07:00' },
  { value: 'Asia/Shanghai', label: '上海', offset: '+08:00' },
  { value: 'Asia/Hong_Kong', label: '香港', offset: '+08:00' },
  { value: 'Asia/Singapore', label: '新加坡', offset: '+08:00' },
  { value: 'Asia/Tokyo', label: '东京', offset: '+09:00' },
  { value: 'Australia/Sydney', label: '悉尼', offset: '+10:00' },
  { value: 'Pacific/Auckland', label: '奥克兰', offset: '+12:00' },
  { value: 'UTC', label: '协调世界时', offset: '+00:00' },
]

// 预设 Cron 表达式
const PRESETS: { id: string; label: string; expr: string; description: string }[] = [
  { id: 'every-minute', label: '每分钟', expr: '* * * * *', description: '每分钟触发一次' },
  { id: 'every-5-min', label: '每 5 分钟', expr: '*/5 * * * *', description: '每 5 分钟一次' },
  { id: 'every-15-min', label: '每 15 分钟', expr: '*/15 * * * *', description: '每 15 分钟一次' },
  { id: 'every-30-min', label: '每 30 分钟', expr: '*/30 * * * *', description: '每半小时一次' },
  { id: 'hourly', label: '每小时', expr: '0 * * * *', description: '每小时整点' },
  { id: 'daily-9am', label: '每天 9:00', expr: '0 9 * * *', description: '每天上午 9 点' },
  { id: 'daily-18pm', label: '每天 18:00', expr: '0 18 * * *', description: '每天下午 6 点' },
  { id: 'weekdays-9am', label: '工作日 9:00', expr: '0 9 * * 1-5', description: '周一至周五上午 9 点' },
  { id: 'monday-9am', label: '每周一 9:00', expr: '0 9 * * 1', description: '每周一上午 9 点' },
  { id: 'first-day-month', label: '每月 1 号 0:00', expr: '0 0 1 * *', description: '每月 1 号零点' },
  { id: 'weekend-10am', label: '周末 10:00', expr: '0 10 * * 6,0', description: '周六、周日 10 点' },
  { id: 'nightly-3am', label: '凌晨 3:00', expr: '0 3 * * *', description: '每天凌晨 3 点' },
]

// === 计算下次执行时间（手算，避免依赖 cron-parser）===
function nextRunAt(expr: string, timezone: string, now = new Date()): Date | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minF, hourF, domF, monF, dowF] = parts
  try {
    // 用 Intl.DateTimeFormat 把 now 转成目标时区的"墙钟时间"
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    // 但更稳的是直接构造一个 formatter 拿年月日时分秒
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const segs = Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
    let Y = Number(segs.year)
    let M = Number(segs.month)
    let D = Number(segs.day)
    let h = Number(segs.hour)
    let m = Number(segs.minute)
    const dow = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(now))
    // JS: 0=Sun; Intl short: Sun=Sun, Mon=Mon → map
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    let curDow = dowMap[dow] ?? dow

    function parseField(f: string, min: number, max: number): number[] | 'all' {
      if (f === '*') return 'all'
      const out: number[] = []
      for (const seg of f.split(',')) {
        const [range, step = '1'] = seg.split('/')
        let lo: number, hi: number
        if (range === '*') { lo = min; hi = max }
        else if (range.includes('-')) {
          const [a, b] = range.split('-').map(Number)
          lo = a; hi = b
        } else {
          lo = hi = Number(range)
        }
        const st = Math.max(1, Number(step))
        for (let v = lo; v <= hi; v += st) out.push(v)
      }
      return [...new Set(out)].sort((a, b) => a - b)
    }
    const minV = parseField(minF, 0, 59)
    const hourV = parseField(hourF, 0, 23)
    const domV = parseField(domF, 1, 31)
    const monV = parseField(monF, 1, 12)
    const dowV = parseField(dowF, 0, 6)

    function match(v: number, spec: number[] | 'all') {
      return spec === 'all' || spec.includes(v)
    }

    // 在目标时区上向前迭代最多 366 天（兜底）
    // 直接构造候选分钟序列：从当前分钟+1 开始
    let candidate = new Date(now.getTime() + 60_000)
    for (let i = 0; i < 60 * 24 * 366; i++) {
      const c = new Date(candidate.getTime())
      const f2 = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
      })
      const p = Object.fromEntries(f2.formatToParts(c).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
      const cm = Number(p.minute)
      const ch = Number(p.hour)
      const cd = Number(p.day)
      const cmo = Number(p.month)
      const cy = Number(p.year)
      const cdow = dowMap[p.weekday] ?? 0
      // DOW 字段语义：0 或 7=Sun
      // 若同时指定 DOW 和 DOM，按 OR（Unix cron）
      const domMatch = match(cd, domV)
      const monMatch = match(cmo, monV)
      const dowMatch = match(cdow, dowV)
      // 标准 cron: dow OR dom
      const dayMatch = (domV === 'all' && dowV === 'all')
        ? true
        : (domV !== 'all' && dowV !== 'all')
          ? (domMatch || dowMatch)
          : (domV !== 'all' ? domMatch : dowMatch)
      if (
        match(cm, minV) &&
        match(ch, hourV) &&
        monMatch &&
        dayMatch
      ) {
        // 把这个墙钟时间映射回 UTC
        // 反推：用目标时区 fmt 出来的时间当 Y/M/D/h/m，反构一个 Date
        const utc = new Date(Date.UTC(cy, cmo - 1, cd, ch, cm, 0))
        // 该 Date 在目标时区的 offset
        const offFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone, timeZoneName: 'shortOffset', year: 'numeric',
        })
        const offStr = offFmt.formatToParts(utc).find(x => x.type === 'timeZoneName')?.value || '+0'
        const offMatch = offStr.match(/GMT([+-]\d+)(?::(\d+))?/)
        let offMin = 0
        if (offMatch) offMin = Number(offMatch[1]) * 60 + (offMatch[2] ? Number(offMatch[2]) : 0)
        const utcMs = utc.getTime() - offMin * 60_000
        if (utcMs > now.getTime()) return new Date(utcMs)
      }
      candidate = new Date(candidate.getTime() + 60_000)
    }
    return null
  } catch {
    return null
  }
}

// === 校验 cron 表达式 ===
function isValidCronExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [minF, hourF, domF, monF, dowF] = parts
  function check(f: string, min: number, max: number) {
    return f.split(',').every(seg => {
      const [range, step] = seg.split('/')
      const st = step ? Number(step) : 1
      if (!Number.isFinite(st) || st < 1) return false
      let lo: number, hi: number
      if (range === '*') return true
      if (range.includes('-')) {
        const [a, b] = range.split('-').map(Number)
        return Number.isFinite(a) && Number.isFinite(b) && a >= min && b <= max && a <= b
      }
      const v = Number(range)
      return Number.isFinite(v) && v >= min && v <= max
    })
  }
  return check(minF, 0, 59) && check(hourF, 0, 23) && check(domF, 1, 31) && check(monF, 1, 12) && check(dowF, 0, 6)
}

// === 端点 ===

// 列出时区
router.get('/timezones', (_req: AuthedRequest, res: Response) => {
  res.json({ success: true, data: TIMEZONES })
})

// 列出预设
router.get('/presets', (_req: AuthedRequest, res: Response) => {
  res.json({ success: true, data: PRESETS })
})

// 校验并预览
router.post('/validate', (req: AuthedRequest, res: Response) => {
  const { expr, timezone = 'Asia/Shanghai' } = (req.body ?? {}) as { expr?: string; timezone?: string }
  if (!expr || typeof expr !== 'string') {
    res.status(400).json({ success: false, error: '表达式必填' })
    return
  }
  const valid = isValidCronExpr(expr)
  if (!valid) {
    res.status(400).json({ success: false, error: 'Cron 表达式格式不合法（需 5 字段：分 时 日 月 周）' })
    return
  }
  const tz = TIMEZONES.some(t => t.value === timezone) ? timezone : 'Asia/Shanghai'
  const next = nextRunAt(expr, tz)
  // 计算接下来 5 次
  const upcoming: string[] = []
  if (next) {
    let cur = next
    for (let i = 0; i < 5; i++) {
      upcoming.push(cur.toISOString())
      // 在目标时区上 +1 分钟继续算
      cur = nextRunAt(expr, tz, new Date(cur.getTime() + 30_000)) ?? cur
    }
  }
  res.json({
    success: true,
    data: {
      valid: true,
      expr,
      timezone: tz,
      nextRunAt: next?.toISOString() ?? null,
      upcoming,
    },
  })
})

// 当前租户的 cron 任务清单
router.get('/schedules', requirePerm('workflow:read'), async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  try {
    const triggers = await db.listAllCronTriggers()
    const items = triggers
      .filter(t => t.tenantId === tenantId)
      .map(t => {
        const expr = String(t.config?.cron ?? '')
        const tz = String(t.config?.timezone ?? 'Asia/Shanghai')
        return {
          workflowId: t.workflowId,
          workflowName: t.workflowName ?? '',
          nodeId: t.nodeId,
          cron: expr,
          timezone: tz,
          enabled: t.enabled,
          nextRunAt: isValidCronExpr(expr) ? nextRunAt(expr, tz)?.toISOString() ?? null : null,
          valid: isValidCronExpr(expr),
        }
      })
    res.json({ success: true, data: items })
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '查询失败' })
  }
})

export default router