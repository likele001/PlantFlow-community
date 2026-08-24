import { useEffect, useMemo, useState } from 'react'
import { Field, type NodeConfigProps } from './types'

type Preset = { id: string; label: string; expr: string; description: string }
type Timezone = { value: string; label: string; offset: string }

function getToken(): string {
  const raw = localStorage.getItem('wf_auth')
  if (raw) { try { return JSON.parse(raw).token ?? '' } catch {} }
  return ''
}

export default function TriggerCronConfig({ node, onChange }: NodeConfigProps) {
  const expr = String(node.config.cron ?? '')
  const timezone = String(node.config.timezone ?? 'Asia/Shanghai')
  const [presets, setPresets] = useState<Preset[]>([])
  const [timezones, setTimezones] = useState<Timezone[]>([])
  const [preview, setPreview] = useState<{ nextRunAt: string | null; upcoming: string[] } | null>(null)
  const [error, setError] = useState<string>('')

  // 加载预设 + 时区
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/cron/presets', { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(j => j?.data ?? []).catch(() => []),
      fetch('/api/cron/timezones', { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(j => j?.data ?? []).catch(() => []),
    ]).then(([p, t]) => {
      if (!cancelled) {
        setPresets(p)
        setTimezones(t)
      }
    })
    return () => { cancelled = true }
  }, [])

  // 预览
  useEffect(() => {
    if (!expr.trim()) { setPreview(null); setError(''); return }
    let cancelled = false
    const t = setTimeout(() => {
      fetch('/api/cron/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ expr, timezone }),
      })
        .then(r => r.json())
        .then(j => {
          if (cancelled) return
          if (j?.success) {
            setError('')
            setPreview({ nextRunAt: j.data?.nextRunAt ?? null, upcoming: j.data?.upcoming ?? [] })
          } else {
            setError(j?.error ?? '校验失败')
            setPreview(null)
          }
        })
        .catch(() => { if (!cancelled) setError('预览服务不可用') })
    }, 300) // 防抖
    return () => { cancelled = true; clearTimeout(t) }
  }, [expr, timezone])

  const tzMap = useMemo(() => Object.fromEntries(timezones.map(t => [t.value, t])), [timezones])

  function pickPreset(p: Preset) {
    onChange('cron', p.expr)
  }

  // 把 UTC ISO 转成 "时区本地" 展示
  function fmtInTz(iso: string | null) {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      const tz = timezone
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
      }).formatToParts(d)
      const get = (k: string) => parts.find(p => p.type === k)?.value ?? ''
      return `${get('year')}-${get('month')}-${get('day')} ${get('weekday')} ${get('hour')}:${get('minute')}`
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-3">
      {/* 预设下拉 */}
      <label className="block text-xs text-zinc-500">
        <span>快速预设</span>
        <select
          value=""
          onChange={(e) => {
            const p = presets.find(x => x.id === e.target.value)
            if (p) pickPreset(p)
          }}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">选择预设…（点击填充）</option>
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.label} — {p.expr}</option>
          ))}
        </select>
      </label>

      {/* Cron 表达式 */}
      <Field label="Cron 表达式" value={expr} onChange={(v) => onChange('cron', v)} placeholder="例如 0 9 * * *" />

      {/* 时区 */}
      <label className="block text-xs text-zinc-500">
        <span>时区</span>
        <select
          value={timezone}
          onChange={(e) => onChange('timezone', e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          {timezones.length === 0 && <option value={timezone}>{timezone}</option>}
          {timezones.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}（{t.offset}）— {t.value}
            </option>
          ))}
        </select>
      </label>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 预览 */}
      {!error && preview && preview.nextRunAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <div className="font-medium">下次执行：{fmtInTz(preview.nextRunAt)}（{timezone}）</div>
          {preview.upcoming.length > 1 && (
            <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              后续：{preview.upcoming.slice(1, 4).map(u => fmtInTz(u)).join('、')}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-zinc-400 leading-relaxed">
        格式：分 时 日 月 周。例如 <code>0 9 * * 1-5</code> = 周一至周五 9 点。
        <br />
        支持 * / , - （如 <code>*/15</code> 每 15 分钟）。
      </div>
    </div>
  )
}