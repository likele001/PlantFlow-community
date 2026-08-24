// pages/Alerts.tsx
// N5 告警中心：列出当前租户所有订阅 + 站内通知；支持订阅、ack、redeliver

import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, Plus, Trash2, RefreshCcw, Webhook, Inbox as InboxIcon, AlertCircle, Copy } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Severity = 'error' | 'warning'
type AlertStatus = 'unread' | 'read' | 'resolved'
type AlertChannel = 'inbox' | 'webhook'

interface Subscription {
  id: string
  workflow_id: string | null
  user_id: string | null
  channel: string
  webhook_url: string | null
  webhook_secret: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

interface AlertRow {
  id: string
  subscription_id: string | null
  execution_id: string | null
  workflow_id: string | null
  severity: Severity
  title: string
  message: string
  status: AlertStatus
  channel: AlertChannel
  delivered_at: string | null
  delivery_error: string | null
  created_at: string
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(iso).toLocaleString()
}

function SeverityBadge({ s }: { s: Severity }) {
  const cls = s === 'error'
    ? 'bg-red-500/10 text-red-700 dark:text-red-300'
    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{s === 'error' ? '错误' : '警告'}</span>
}

function StatusBadge({ s }: { s: AlertStatus }) {
  const cls = s === 'unread'
    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
    : s === 'read'
      ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{s === 'unread' ? '未读' : s === 'read' ? '已读' : '已解决'}</span>
}

export default function Alerts() {
  const { token } = useAuthStore()
  const [tab, setTab] = useState<'list' | 'subs'>('list')
  const [items, setItems] = useState<AlertRow[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | AlertStatus>('all')

  // 订阅表单
  const [subChannel, setSubChannel] = useState<'inbox' | 'webhook' | 'inbox,webhook'>('inbox')
  const [subUrl, setSubUrl] = useState('')
  const [subSecret, setSubSecret] = useState('')
  const [subWorkflow, setSubWorkflow] = useState('')
  const [subBusy, setSubBusy] = useState(false)
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([])

  const loadAlerts = useCallback(async () => {
    if (!token) return
    const qs = filter === 'all' ? '' : `?status=${filter}`
    const res = await apiRequest<AlertRow[]>(`/api/alerts${qs}`, { token })
    if ('data' in res) setItems(res.data)
    else setErr(res.error)
  }, [token, filter])

  const loadSubs = useCallback(async () => {
    if (!token) return
    const res = await apiRequest<Subscription[]>(`/api/alerts/subscriptions`, { token })
    if ('data' in res) setSubs(res.data)
    else setErr(res.error)
  }, [token])

  const loadWorkflows = useCallback(async () => {
    if (!token) return
    const res = await apiRequest<{ id: string; name: string }[]>(`/api/workflows`, { token })
    if ('data' in res) setWorkflows(res.data.map(w => ({ id: w.id, name: w.name })))
  }, [token])

  useEffect(() => { void loadAlerts() }, [loadAlerts])
  useEffect(() => { void loadSubs(); void loadWorkflows() }, [loadSubs, loadWorkflows])

  async function ack(id: string, status: AlertStatus) {
    if (!token) return
    const res = await apiRequest(`/api/alerts/${id}/ack`, { method: 'POST', body: { status }, token })
    if ('error' in res) { setErr(res.error); return }
    void loadAlerts()
  }

  async function redeliver(id: string) {
    if (!token) return
    setErr(null)
    const res = await apiRequest(`/api/alerts/${id}/redeliver`, { method: 'POST', token })
    if ('error' in res) { setErr(res.error); return }
    void loadAlerts()
  }

  async function createSub(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setSubBusy(true); setErr(null)
    const body: Record<string, unknown> = {
      channel: subChannel,
      webhook_url: subChannel.includes('webhook') ? subUrl : null,
      webhook_secret: subChannel.includes('webhook') && subSecret ? subSecret : null,
      workflow_id: subWorkflow || null,
    }
    const res = await apiRequest<Subscription>(`/api/alerts/subscriptions`, {
      method: 'POST', body, token,
    })
    setSubBusy(false)
    if ('error' in res) { setErr(res.error); return }
    setSubUrl(''); setSubSecret(''); setSubWorkflow('')
    void loadSubs()
  }

  async function delSub(id: string) {
    if (!token) return
    const res = await apiRequest(`/api/alerts/subscriptions/${id}`, { method: 'DELETE', token })
    if ('error' in res) { setErr(res.error); return }
    void loadSubs()
  }

  async function toggleSub(s: Subscription) {
    if (!token) return
    const res = await apiRequest(`/api/alerts/subscriptions/${s.id}`, {
      method: 'PUT', body: { enabled: !s.enabled }, token,
    })
    if ('error' in res) { setErr(res.error); return }
    void loadSubs()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">告警中心</div>
          <div className="mt-2 text-2xl font-semibold">失败告警与推送订阅</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            工作流执行失败时，按订阅自动推送到站内通知 / Webhook（可指向企微/钉钉/飞书 incoming webhook）
          </div>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <button type="button" onClick={() => setTab('list')}
            className={cn('rounded-lg px-3 py-1.5 font-semibold', tab === 'list' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-600 dark:text-zinc-300')}>
            通知
          </button>
          <button type="button" onClick={() => setTab('subs')}
            className={cn('rounded-lg px-3 py-1.5 font-semibold', tab === 'subs' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-600 dark:text-zinc-300')}>
            订阅
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div> : null}

      {tab === 'list' && (
        <>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | AlertStatus)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <option value="all">全部</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
              <option value="resolved">已解决</option>
            </select>
            <button type="button" onClick={() => void loadAlerts()}
              className="inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-semibold">
              <RefreshCcw className="h-4 w-4" /> 刷新
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="divide-y dark:divide-zinc-800">
              {items.map(a => (
                <div key={a.id} className={cn('flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-start sm:gap-3 sm:px-5', a.status === 'unread' && 'bg-blue-50/40 dark:bg-blue-950/20')}> 
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <SeverityBadge s={a.severity} />
                      <StatusBadge s={a.status} />
                      <span className="text-xs text-zinc-400">{formatRelative(a.created_at)}</span>
                      <span className="text-xs text-zinc-400">·</span>
                      <span className="text-xs text-zinc-400">{a.channel === 'webhook' ? 'Webhook' : '站内'}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold">{a.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{a.message}</div>
                    {a.delivery_error && (
                      <div className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        推送失败：{a.delivery_error}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:gap-1"> 
                    {a.status === 'unread' && (
                      <button type="button" onClick={() => void ack(a.id, 'read')}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                        <Check className="h-3 w-3" /> 已读
                      </button>
                    )}
                    {a.status !== 'resolved' && (
                      <button type="button" onClick={() => void ack(a.id, 'resolved')}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                        解决
                      </button>
                    )}
                    {a.channel === 'webhook' && (
                      <button type="button" onClick={() => void redeliver(a.id)}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                        <RefreshCcw className="h-3 w-3" /> 重推
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!items.length && <div className="px-5 py-16 text-center text-sm text-zinc-500">暂无告警</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'subs' && (
        <>
          <form onSubmit={createSub} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 text-sm font-semibold">新建订阅</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="block text-zinc-500">渠道</span>
                <select value={subChannel} onChange={(e) => setSubChannel(e.target.value as 'inbox' | 'webhook' | 'inbox,webhook')}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <option value="inbox">站内通知</option>
                  <option value="webhook">Webhook</option>
                  <option value="inbox,webhook">站内 + Webhook</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-zinc-500">工作流（留空 = 全部）</span>
                <select value={subWorkflow} onChange={(e) => setSubWorkflow(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <option value="">全部</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              {subChannel.includes('webhook') && (
                <>
                  <label className="text-xs sm:col-span-2">
                    <span className="block text-zinc-500">Webhook URL</span>
                    <input value={subUrl} onChange={(e) => setSubUrl(e.target.value)} required
                      placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
                  </label>
                  <label className="text-xs sm:col-span-2">
                    <span className="block text-zinc-500">可选 Secret（作为 X-Alert-Secret 头）</span>
                    <input value={subSecret} onChange={(e) => setSubSecret(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
                  </label>
                </>
              )}
            </div>
            <button type="submit" disabled={subBusy}
              className="mt-4 inline-flex h-10 items-center gap-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">
              <Plus className="h-4 w-4" /> {subBusy ? '创建中…' : '创建订阅'}
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b px-3 py-3 sm:px-5 sm:py-4 text-sm font-semibold dark:border-zinc-800">已有订阅</div>
            <div className="divide-y dark:divide-zinc-800">
              {subs.map(s => (
                <div key={s.id} className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    s.channel.includes('webhook') ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600')}>
                    {s.channel.includes('webhook') ? <Webhook className="h-4 w-4" /> : <InboxIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{s.channel}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                        s.enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10 text-zinc-500')}>
                        {s.enabled ? '启用' : '停用'}
                      </span>
                      <span className="text-xs text-zinc-400">{formatRelative(s.created_at)}</span>
                    </div>
                    {s.webhook_url && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                        <span className="truncate font-mono">{s.webhook_url}</span>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(s.webhook_url ?? '')}
                          className="text-zinc-400 hover:text-zinc-700">
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {s.workflow_id && (
                      <div className="mt-0.5 text-xs text-zinc-500">仅工作流 <span className="font-mono">{s.workflow_id.slice(0, 8)}…</span></div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void toggleSub(s)}
                      className="inline-flex h-8 items-center rounded-lg border px-2 text-xs">
                      {s.enabled ? '停用' : '启用'}
                    </button>
                    <button type="button" onClick={() => void delSub(s.id)}
                      className="inline-flex h-8 items-center rounded-lg border border-red-200 px-2 text-xs text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {!subs.length && <div className="px-5 py-16 text-center text-sm text-zinc-500">尚未配置订阅 — 新建一个开始接收失败告警</div>}
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700">
        <Bell className="mr-1 inline h-3.5 w-3.5" />
        平台不对企微/飞书/钉钉进行原生接入 — 把 incoming webhook 填到「Webhook URL」即可将失败推送到对应群。
        Webhook 推送失败时会在此留痕，可一键重推。
      </div>
    </div>
  )
}