import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Activity, BarChart3, Cpu, RefreshCw, GitBranch, CircleDollarSign } from 'lucide-react'

type UsageSummary = {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCost: number
  calls: number
  byModel: { model: string; calls: string; totalTokens: string; estimatedCost: string }[]
  byDay: { day: string; calls: string; totalTokens: string; estimatedCost: string }[]
}

type UsageRow = {
  id: string
  executionId?: string | null
  nodeId?: string | null
  agentId?: string | null
  kind: string
  providerName?: string | null
  model?: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  createdAt: string
}

type TraceRow = {
  id: string
  executionId?: string | null
  sessionId?: string | null
  step: string
  toolName?: string | null
  args?: unknown
  result?: unknown
  llmModel?: string | null
  llmPromptTokens?: number | null
  llmCompletionTokens?: number | null
  durationMs?: number | null
  error?: string | null
  createdAt: string
}

const KIND_LABEL: Record<string, string> = { chat: '对话', embedding: '向量化', tool: 'Agent 工具', stream: '流式' }

function getToken(): string {
  const raw = localStorage.getItem('wf_auth')
  if (raw) { try { return JSON.parse(raw).token ?? '' } catch {} }
  return useAuthStore.getState().token ?? ''
}

async function api<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } })
  const j = await r.json()
  if (!j.success) throw new Error(j.error || '加载失败')
  return j.data as T
}

function fmtNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

export default function Observability() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [traces, setTraces] = useState<TraceRow[]>([])
  const [kind, setKind] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const q = kind ? `?kind=${encodeURIComponent(kind)}` : ''
      const [s, u, t] = await Promise.all([
        api<UsageSummary>(`/api/observability/llm-usage/summary${q}`),
        api<UsageRow[]>(`/api/observability/llm-usage${q}&limit=100`),
        api<TraceRow[]>('/api/observability/agent-traces?limit=100'),
      ])
      setSummary(s)
      setUsage(u)
      setTraces(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (!loading) load() }, [kind])

  const maxDay = summary?.byDay[0] ? Number(summary.byDay[0].totalTokens) : 0

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity className="h-6 w-6" />
            可观测性
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            LLM 用量 / 成本与 Agent 调用链观测。每次 AI 调用自动记录 token，用于成本核算与链路排查。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="">全部类型</option>
            <option value="chat">对话</option>
            <option value="embedding">向量化</option>
            <option value="tool">Agent 工具</option>
            <option value="stream">流式</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        <StatCard icon={<Cpu className="h-5 w-5" />} label="调用次数" value={fmtNumber(summary?.calls ?? 0)} />
        <StatCard icon={<BarChart3 className="h-5 w-5" />} label="总 Token" value={fmtNumber(summary?.totalTokens ?? 0)} />
        <StatCard icon={<GitBranch className="h-5 w-5" />} label="输出 Token" value={fmtNumber(summary?.completionTokens ?? 0)} />
        <StatCard icon={<CircleDollarSign className="h-5 w-5" />} label="估算成本 (USD)" value={Number(summary?.estimatedCost ?? 0).toFixed(6)} />
      </div>

      {/* 按日用量柱状图 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">近 60 天 Token 趋势</h2>
        {summary?.byDay.length ? (
          <div className="flex h-40 items-end gap-1">
            {summary.byDay.slice(0, 30).reverse().map((d) => {
              const v = Number(d.totalTokens)
              const h = maxDay ? Math.max(2, Math.round((v / maxDay) * 100)) : 2
              return (
                <div key={d.day} className="group flex flex-1 flex-col items-center" title={`${d.day} · ${fmtNumber(v)} tokens · ${d.calls} 次`}>
                  <div className="w-full rounded-t bg-violet-500/70 transition group-hover:bg-violet-600" style={{ height: `${h}px` }} />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">暂无数据 — 调用一次 AI 节点后此处会出现趋势。</p>
        )}
      </section>

      {/* 按模型统计 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">按模型统计</h2>
        {summary?.byModel.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="pb-2">模型</th>
                <th className="pb-2">调用</th>
                <th className="pb-2">Token</th>
                <th className="pb-2">成本 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {summary.byModel.map((m) => (
                <tr key={m.model} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 font-medium">{m.model}</td>
                  <td className="py-2">{Number(m.calls).toLocaleString()}</td>
                  <td className="py-2">{Number(m.totalTokens).toLocaleString()}</td>
                  <td className="py-2">{Number(m.estimatedCost).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-400">暂无数据</p>
        )}
      </section>

      {/* 用量明细 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">最近调用明细</h2>
        {usage.length ? (
          <div className="space-y-2">
            {usage.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    {KIND_LABEL[u.kind] ?? u.kind}
                  </span>
                  <div className="text-sm">
                    <span className="font-medium">{u.model ?? '—'}</span>
                    <span className="ml-2 text-xs text-zinc-400">{u.providerName ?? ''}</span>
                    {u.nodeId && <span className="ml-2 text-xs text-zinc-400">节点 {u.nodeId.slice(0, 8)}</span>}
                  </div>
                </div>
                <div className="text-right text-sm text-zinc-500">
                  <span>{u.promptTokens} + {u.completionTokens} = <b>{u.totalTokens}</b></span>
                  <span className="ml-3">{Number(u.estimatedCost).toFixed(6)} USD</span>
                  <div className="text-xs text-zinc-400">{new Date(u.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">暂无调用记录</p>
        )}
      </section>

      {/* Agent 调用链 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <GitBranch className="h-5 w-5" />
          Agent 调用链
        </h2>
        {traces.length ? (
          <div className="space-y-1.5">
            {traces.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-xl border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${t.step === 'tool' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{t.step === 'tool' ? `🛠 ${t.toolName ?? 'tool'}` : 'LLM 调用'}</span>
                    {t.llmModel && <span className="text-xs text-zinc-400">{t.llmModel}</span>}
                    {t.durationMs != null && <span className="text-xs text-zinc-400">{t.durationMs}ms</span>}
                    {t.executionId && <span className="text-xs text-zinc-400">exec {t.executionId.slice(0, 8)}</span>}
                    {t.error && <span className="text-xs text-red-500">{t.error}</span>}
                  </div>
                  {(t.args !== undefined || t.result !== undefined) && (
                    <pre className="mt-1 max-h-24 overflow-auto text-xs text-zinc-400">
                      {JSON.stringify({ args: t.args, result: t.result }, null, 0).slice(0, 400)}
                    </pre>
                  )}
                </div>
                <div className="text-xs text-zinc-400">{new Date(t.createdAt).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">暂无 Agent 调用链记录 — 运行一次带工具的 AI 智能体节点后此处会显示。</p>
        )}
      </section>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}