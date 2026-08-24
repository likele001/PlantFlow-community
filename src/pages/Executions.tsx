// pages/Executions.tsx
// N5 增强：在失败详情区加"一键订阅失败告警"按钮 + 失败横幅提示
// 其他逻辑保持与原文件一致

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowUpLeft, Bell, ChevronDown, ChevronRight, Clock, ExternalLink, GitBranch, Play, RotateCcw, Terminal } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Execution = {
  id: string
  workflowId: string
  workflowName?: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  triggerType: string
  triggerData?: unknown
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

type ExecutionStep = {
  id: string
  nodeId: string
  nodeType: string
  nodeLabel: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

type ExecutionDetail = Execution & {
  steps: ExecutionStep[]
  parentExecutionId?: string | null
  children?: ChildExecution[]
}

type ChildExecution = {
  id: string
  workflowId: string
  workflowName?: string
  status: Execution['status']
  triggerType: string
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

interface Subscription {
  id: string
  workflow_id: string | null
  channel: string
  enabled: boolean
}

const statusLabel: Record<string, string> = {
  running: '运行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  skipped: '跳过',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'success'
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'failed'
      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
      : status === 'running'
        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
        : status === 'skipped'
          ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
          : 'bg-zinc-500/10 text-zinc-500'
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{statusLabel[status] ?? status}</span>
}

function StepTimeline({ steps, trigger }: { steps: ExecutionStep[]; trigger: unknown }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const totalDuration = useMemo(() => {
    if (!steps.length) return 0
    const first = new Date(steps[0].startedAt).getTime()
    const last = steps[steps.length - 1].finishedAt
    if (!last) return 0
    return new Date(last).getTime() - first
  }, [steps])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>{steps.length} 个节点</span>
        {totalDuration > 0 && (
          <>
            <span>·</span>
            <span>总耗时 {formatDuration(totalDuration)}</span>
          </>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
        <button
          onClick={() => setExpandedId(expandedId === '__trigger__' ? null : '__trigger__')}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Play className="h-3.5 w-3.5 text-blue-500" />
            触发数据
          </div>
          {expandedId === '__trigger__' ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {expandedId === '__trigger__' && (
          <pre className="max-h-80 overflow-auto border-t border-zinc-200 p-4 text-xs dark:border-zinc-800">{JSON.stringify(trigger, null, 2)}</pre>
        )}
      </div>

      <div className="relative">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1
          const isExpanded = expandedId === s.id
          const dur = s.finishedAt
            ? formatDuration(new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime())
            : null

          return (
            <div key={s.id} className="relative flex gap-4 pb-4">
              {!isLast && (
                <div className={cn(
                  'absolute left-[15px] top-8 w-0.5',
                  s.status === 'success' ? 'bg-emerald-300 dark:bg-emerald-700' :
                  s.status === 'failed' ? 'bg-red-300 dark:bg-red-700' :
                  'bg-zinc-300 dark:bg-zinc-600'
                )} style={{ height: 'calc(100% - 8px)' }} />
              )}

              <div className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                s.status === 'success' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' :
                s.status === 'failed' ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400' :
                s.status === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
                'border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
              )}>
                <span className="text-[10px] font-bold">{i + 1}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'cursor-pointer rounded-xl border p-4 transition hover:shadow-sm',
                    isExpanded
                      ? 'border-zinc-300 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-900'
                      : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
                    s.status === 'failed' && 'border-red-200 dark:border-red-900',
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{s.nodeLabel}</span>
                        <span className="hidden text-[10px] text-zinc-400 sm:inline font-mono">{s.nodeType}</span>
                      </div>
                      {dur && <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400"><Clock className="h-3 w-3" />{dur}</div>}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  {s.error && (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                      {s.error}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      {s.input != null && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-500">
                            <Terminal className="h-3 w-3" /> 输入
                          </div>
                          <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px] dark:bg-zinc-900">{JSON.stringify(s.input, null, 2)}</pre>
                        </div>
                      )}
                      {s.output != null && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-500">
                            <Terminal className="h-3 w-3" /> 输出
                          </div>
                          <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-[11px] dark:bg-zinc-900">{JSON.stringify(s.output, null, 2)}</pre>
                        </div>
                      )}
                      <div className="text-[11px] text-zinc-400">
                        <span>开始: {new Date(s.startedAt).toLocaleString()}</span>
                        {s.finishedAt && <span className="ml-3">结束: {new Date(s.finishedAt).toLocaleString()}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Executions() {
  const { token } = useAuthStore()
  const [params] = useSearchParams()
  const highlight = params.get('highlight')
  const [items, setItems] = useState<Execution[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExecutionDetail | null>(null)
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 告警订阅相关
  const [subs, setSubs] = useState<Subscription[]>([])
  const [subBusy, setSubBusy] = useState(false)

  async function loadList() {
    if (!token) return
    const q = filter ? `?status=${encodeURIComponent(filter)}` : ''
    const res = await apiRequest<Execution[]>(`/api/executions${q}`, { token })
    if ('data' in res) {
      setItems(res.data)
      if (highlight && res.data.some((e) => e.id === highlight)) {
        setActiveId(highlight)
      } else if (!activeId && res.data[0]) {
        setActiveId(res.data[0].id)
      }
    }
  }

  async function loadSubs() {
    if (!token) return
    const res = await apiRequest<Subscription[]>(`/api/alerts/subscriptions`, { token })
    if ('data' in res) setSubs(res.data)
  }

  useEffect(() => { void loadList() }, [token, filter, highlight])
  useEffect(() => { void loadSubs() }, [token])

  useEffect(() => {
    async function loadDetail() {
      if (!token || !activeId) { setDetail(null); return }
      const res = await apiRequest<ExecutionDetail>(`/api/executions/${activeId}`, { token })
      if ('data' in res) setDetail(res.data)
    }
    void loadDetail()
  }, [token, activeId])

  async function retry(id: string) {
    if (!token) return
    setBusy(true); setErr(null)
    const res = await apiRequest<{ executionId: string }>(`/api/executions/${id}/retry`, { method: 'POST', token })
    setBusy(false)
    if (!('data' in res)) { setErr(res.error); return }
    await loadList()
    setActiveId(res.data.executionId)
  }

  async function subscribeWorkflow(workflowId: string) {
    if (!token) return
    setSubBusy(true); setErr(null)
    const res = await apiRequest<Subscription>(`/api/alerts/subscriptions`, {
      method: 'POST',
      body: { channel: 'inbox', workflow_id: workflowId },
      token,
    })
    setSubBusy(false)
    if ('error' in res) { setErr(res.error); return }
    setToast('已订阅该工作流的失败告警（站内通知）')
    void loadSubs()
    setTimeout(() => setToast(null), 3000)
  }

  async function jumpToExecution(id: string) {
    if (!token) return
    if (!items.some((e) => e.id === id)) {
      const res = await apiRequest<ExecutionDetail>(`/api/executions/${id}`, { token })
      if ('data' in res) {
        const d = res.data
        setItems((prev) => [...prev, {
          id: d.id, workflowId: d.workflowId, workflowName: d.workflowName,
          status: d.status, triggerType: d.triggerType, startedAt: d.startedAt, finishedAt: d.finishedAt,
        }])
      }
    }
    setActiveId(id)
  }

  const active = useMemo(() => items.find((e) => e.id === activeId) ?? null, [activeId, items])
  const subscribedForActive = !!detail && subs.some(s => s.workflow_id === detail.workflowId && s.enabled)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">执行中心</div>
          <div className="mt-2 text-2xl font-semibold">运行记录与追踪</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">查看每次工作流运行的时间线、节点输入/输出详情</div>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="running">运行中</option>
        </select>
      </div>

      {err ? <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div> : null}
      {toast ? <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700">{toast}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b px-3 py-3 sm:px-5 sm:py-4 text-sm font-semibold dark:border-zinc-800">执行记录</div>
          <div className="divide-y dark:divide-zinc-800">
            {items.map((e) => (
              <button
                key={e.id} type="button"
                onClick={() => setActiveId(e.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-3 sm:px-5 sm:py-4 text-left transition',
                  activeId === e.id ? 'bg-zinc-50 dark:bg-zinc-900/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.workflowName ?? e.workflowId}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <StatusBadge status={e.status} />
                    <span>{new Date(e.startedAt).toLocaleString()}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            ))}
            {!items.length ? <div className="px-5 py-16 text-center text-sm text-zinc-500">暂无执行记录</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          {active && detail ? (
            <>
              {detail.status === 'failed' && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold">本次执行失败</div>
                    {detail.error && <div className="mt-0.5 text-xs">{detail.error}</div>}
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">{detail.workflowName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <StatusBadge status={detail.status} />
                    <span>触发：{detail.triggerType}</span>
                  </div>
                  {detail.error ? <div className="mt-2 text-sm text-red-600">{detail.error}</div> : null}
                  {detail.parentExecutionId ? (
                    <button type="button" onClick={() => void jumpToExecution(detail.parentExecutionId!)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-zinc-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30">
                      <ArrowUpLeft className="h-3.5 w-3.5" /> 返回父执行
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.status === 'failed' ? (
                    <button type="button" disabled={busy} onClick={() => void retry(detail.id)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" /> 重试
                    </button>
                  ) : null}
                  {detail.status === 'failed' && !subscribedForActive && (
                    <button type="button" disabled={subBusy} onClick={() => void subscribeWorkflow(detail.workflowId)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      <Bell className="h-4 w-4" /> 订阅失败告警
                    </button>
                  )}
                  <Link to={`/workflows/${detail.workflowId}/editor`}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold">
                    <ExternalLink className="h-3.5 w-3.5" /> 打开工作流
                  </Link>
                </div>
              </div>

              <div className="mt-5">
                <StepTimeline steps={detail.steps} trigger={detail.triggerData} />
              </div>

              {detail.children && detail.children.length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    <GitBranch className="h-4 w-4 text-indigo-500" />
                    子工作流调用（{detail.children.length}）
                  </div>
                  <div className="space-y-2">
                    {detail.children.map((c) => (
                      <button key={c.id} type="button" onClick={() => void jumpToExecution(c.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-zinc-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30">
                        <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{c.workflowName ?? c.workflowId}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                            <StatusBadge status={c.status} />
                            <span>{new Date(c.startedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-indigo-600 dark:text-indigo-400">查看 ›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : <div className="py-20 text-center text-sm text-zinc-500">选择左侧执行记录查看详情</div>}
        </div>
      </div>
    </div>
  )
}