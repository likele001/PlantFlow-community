import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Calendar, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

type Schedule = {
  workflowId: string
  workflowName: string
  nodeId: string
  cron: string
  timezone: string
  enabled: boolean
  nextRunAt: string | null
  valid: boolean
}

export default function CronSchedules() {
  const [items, setItems] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  function getToken(): string {
    const raw = localStorage.getItem('wf_auth')
    if (raw) { try { return JSON.parse(raw).token ?? '' } catch {} }
    return useAuthStore.getState().token ?? ''
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/cron/schedules', { headers: { Authorization: `Bearer ${getToken()}` } })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || '加载失败')
      setItems(j.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function fmtInTz(iso: string | null, tz: string) {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
      }).formatToParts(d)
      const g = (k: string) => parts.find(p => p.type === k)?.value ?? ''
      return `${g('year')}-${g('month')}-${g('day')} ${g('weekday')} ${g('hour')}:${g('minute')}`
    } catch {
      return iso
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clock className="h-6 w-6" />
            定时任务中心
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            列出当前租户所有已发布工作流的 Cron 调度。每分钟由后台 scheduler 自动加载。
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          刷新
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          暂无定时任务。在工作流编辑器中添加 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">trigger.cron</code> 节点并发布工作流后，会在这里出现。
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left">工作流</th>
                <th className="px-4 py-3 text-left">Cron</th>
                <th className="px-4 py-3 text-left">时区</th>
                <th className="px-4 py-3 text-left">下次执行</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((s) => (
                <tr key={`${s.workflowId}:${s.nodeId}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.workflowName || '(未命名)'}</div>
                    <div className="text-xs text-zinc-400">{s.workflowId.slice(0, 8)}… · 节点 {s.nodeId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{s.cron}</code>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.timezone}</td>
                  <td className="px-4 py-3">
                    {s.valid ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                        {fmtInTz(s.nextRunAt, s.timezone)}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.valid ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">启用</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-900 dark:text-red-200">表达式错误</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/workflows/${s.workflowId}/editor`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      打开编辑器 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        <strong>使用提示：</strong>
        Cron 表达式支持标准 5 字段语法（分 时 日 月 周）。
        例如 <code>0 9 * * 1-5</code> = 周一至周五 9:00。
        修改表达式或时区后，scheduler 在最多 60 秒内自动重载。
      </div>
    </div>
  )
}