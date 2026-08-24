import { useEffect, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { apiRequest } from '@/utils/api'

type Agent = {
  id: string
  name: string
  description: string
  systemPrompt: string
  modelProviderId: string | null
  tools: string[]
  allowedSources: string[]
  maxTurns: number
  timeoutMs: number
  status: 'draft' | 'published' | string
  createdAt: string
  updatedAt: string
}

type Provider = { id: string; name: string; type: string }
type DataSource = { id: string; name: string; kind: string }

const TOOL_OPTIONS = [
  { key: 'workflow.run', label: '触发工作流' },
  { key: 'http.request', label: 'HTTP 请求' },
  { key: 'knowledge.search', label: '知识库检索' },
  { key: 'data_access.query', label: '数据源查询' },
]

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}

export default function AgentDebug() {
  const token = localStorage.getItem('wf_auth') ? JSON.parse(localStorage.getItem('wf_auth')!).token : null
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    modelProviderId: '',
    tools: [] as string[],
    allowedSources: [] as string[],
    maxTurns: 10,
    timeoutMs: 60000,
    status: 'draft',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  // 调试
  const [debugAgentId, setDebugAgentId] = useState('')
  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{
    reply: string
    turns: number
    totalDurationMs: number
    toolCalls: { name: string; args: unknown; result: unknown; durationMs: number }[]
  } | null>(null)

  useEffect(() => { void fetchAll() }, [])

  async function fetchAll() {
    await Promise.all([fetchAgents(), fetchProviders(), fetchSources()])
  }
  async function fetchAgents() {
    const res = await apiRequest<Agent[]>('/api/agents', { token })
    if (res.success) setAgents(res.data ?? [])
  }
  async function fetchProviders() {
    const res = await apiRequest<Provider[]>('/api/ai/providers', { token })
    if (res.success) setProviders(res.data ?? [])
  }
  async function fetchSources() {
    const res = await apiRequest<DataSource[]>('/api/data-access/sources', { token })
    if (res.success) setSources(res.data ?? [])
  }


  async function generateFromAI() {
    if (!aiDesc.trim()) {
      setError('请输入需求描述')
      return
    }
    setAiBusy(true)
    setError('')
    try {
      const resp = await apiRequest<{ data: { name: string; description: string; systemPrompt: string; tools: string[]; maxTurns: number; timeoutMs: number; source: string } }>(
        '/api/ai-build/agent',
        { method: 'POST', body: JSON.stringify({ description: aiDesc.trim() }) },
      )
      const d = resp.data
      setForm({
        name: d.name,
        description: d.description || '',
        systemPrompt: d.systemPrompt,
        modelProviderId: '',
        tools: Array.isArray(d.tools) ? d.tools : [],
        allowedSources: [],
        maxTurns: typeof d.maxTurns === 'number' ? d.maxTurns : 8,
        timeoutMs: typeof d.timeoutMs === 'number' ? d.timeoutMs : 120000,
        status: 'draft',
      })
      setShowForm(true)
      setAiOpen(false)
      setAiDesc('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 生成失败')
    } finally {
      setAiBusy(false)
    }
  }

  function resetForm() {
    setForm({ name: '', description: '', systemPrompt: '', modelProviderId: '', tools: [], allowedSources: [], maxTurns: 10, timeoutMs: 60000, status: 'draft' })
    setEditId(null)
    setShowForm(false)
    setError('')
  }
  function openCreate() { resetForm(); setShowForm(true) }
  function openEdit(a: Agent) {
    setForm({
      name: a.name,
      description: a.description,
      systemPrompt: a.systemPrompt,
      modelProviderId: a.modelProviderId ?? '',
      tools: a.tools ?? [],
      allowedSources: a.allowedSources ?? [],
      maxTurns: a.maxTurns,
      timeoutMs: a.timeoutMs,
      status: a.status,
    })
    setEditId(a.id)
    setShowForm(true)
  }

  function toggleTool(key: string) {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(key) ? f.tools.filter((t) => t !== key) : [...f.tools, key],
    }))
  }
  function toggleSource(id: string) {
    setForm((f) => ({
      ...f,
      allowedSources: f.allowedSources.includes(id) ? f.allowedSources.filter((s) => s !== id) : [...f.allowedSources, id],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('名称必填'); return }
    setLoading(true)
    setError('')
    const body = {
      name: form.name.trim(),
      description: form.description,
      systemPrompt: form.systemPrompt,
      modelProviderId: form.modelProviderId || null,
      tools: form.tools,
      allowedSources: form.allowedSources,
      maxTurns: Number(form.maxTurns) || 10,
      timeoutMs: Number(form.timeoutMs) || 60000,
      status: form.status,
    }
    try {
      const res = editId
        ? await apiRequest(`/api/agents/${editId}`, { method: 'PATCH', body, token })
        : await apiRequest('/api/agents', { method: 'POST', body, token })
      if (!res.success) { setError(res.error ?? '保存失败'); return }
      resetForm()
      await fetchAgents()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(a: Agent) {
    if (!confirm(`确定删除 Agent「${a.name}」？`)) return
    const res = await apiRequest(`/api/agents/${a.id}`, { method: 'DELETE', token })
    if (res.success) await fetchAgents()
    else setError(res.error ?? '删除失败')
  }

  async function handleRun() {
    if (!debugAgentId) { setError('请选择 Agent'); return }
    if (!message.trim()) { setError('请输入调试消息'); return }
    setError('')
    setRunning(true)
    setRunResult(null)
    try {
      const res = await apiRequest('/api/agents/' + debugAgentId + '/run', {
        method: 'POST',
        body: { message },
        token,
      })
      if (res.success) setRunResult(res.data as typeof runResult)
      else setError(res.error ?? '运行失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6 p-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Agent 调试</h1>
          <p className="text-sm text-zinc-500">配置工具型 Agent，并可视化查看每次意图判断、工具调用与最终回复</p>
        </div>
        <button onClick={() => setAiOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-400/10">
          <Sparkles className="h-4 w-4" /> AI 生成
        </button>
        <button onClick={openCreate}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          新建 Agent
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">{error}</div>
      ) : null}

      {aiOpen ? (
        <div className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/40 p-4 dark:border-amber-400/30 dark:bg-amber-400/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <div className="font-semibold">AI 生成 Agent</div>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">N3 Beta</span>
            </div>
            <button onClick={() => !aiBusy && setAiOpen(false)} className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-400/20">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="text-xs text-zinc-500">需求描述</label>
            <textarea
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              disabled={aiBusy}
              rows={3}
              placeholder="例如：客服 Agent，能查订单数据库回答发货问题；调用知识库回答售后政策"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-zinc-500">AI 将按可用工具枚举生成 Agent 配置，生成后可在表单微调</div>
            <div className="flex gap-2">
              <button onClick={() => setAiOpen(false)} disabled={aiBusy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">
                取消
              </button>
              <button onClick={() => void generateFromAI()} disabled={aiBusy || !aiDesc.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiBusy ? '生成中…' : '生成'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editId ? '编辑 Agent' : '新建 Agent'}</h3>
            <button onClick={resetForm} className="text-sm text-zinc-400 hover:text-zinc-600">取消</button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              名称
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
            <label className="block text-xs text-zinc-500">
              状态
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
              </select>
            </label>
          </div>

          <label className="block text-xs text-zinc-500">
            描述
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Agent 用途简述" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </label>

          <label className="block text-xs text-zinc-500">
            System Prompt
            <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={4}
              placeholder="你是…，遇到数据查询需求时使用数据源查询工具。"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </label>

          <label className="block text-xs text-zinc-500">
            模型 Provider
            <select value={form.modelProviderId} onChange={(e) => setForm({ ...form, modelProviderId: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">使用默认 Provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.type}）</option>)}
            </select>
          </label>

          <div>
            <div className="text-xs text-zinc-500">可用工具</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((t) => (
                <button key={t.key} onClick={() => toggleTool(t.key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${form.tools.includes(t.key) ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'dark:border-zinc-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">可访问数据源（限制 data_access 范围）</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {sources.map((s) => (
                <button key={s.id} onClick={() => toggleSource(s.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${form.allowedSources.includes(s.id) ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'dark:border-zinc-700'}`}>
                  {s.name}
                </button>
              ))}
              {sources.length === 0 ? <span className="text-xs text-zinc-400">暂无数据源</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              最大轮数
              <input type="number" value={form.maxTurns} onChange={(e) => setForm({ ...form, maxTurns: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
            <label className="block text-xs text-zinc-500">
              超时 ms
              <input type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
          </div>

          <button onClick={handleSave} disabled={loading}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {loading ? '保存中…' : '保存'}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border p-4 dark:border-zinc-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[a.status] ?? ''}`}>{a.status}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500 line-clamp-2">{a.description || '无描述'}</div>
              <div className="mt-1 text-xs text-zinc-400">工具: {(a.tools ?? []).length ? a.tools.join(', ') : '无'} · 最大轮数 {a.maxTurns}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => { setDebugAgentId(a.id); setRunResult(null) }} className="rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700">调试</button>
              <button onClick={() => openEdit(a)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700">编辑</button>
              <button onClick={() => handleDelete(a)} className="rounded-lg border px-3 py-1.5 text-sm text-red-600 dark:border-zinc-700">删除</button>
            </div>
          </div>
        ))}
        {agents.length === 0 && !showForm ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zinc-400">暂无 Agent，点击右上角新建</div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
        <h3 className="font-semibold">调试运行</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-zinc-500">
            Agent
            <select value={debugAgentId} onChange={(e) => setDebugAgentId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">选择 Agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-500 sm:col-span-2">
            消息
            <input value={message} onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !running) void handleRun() }}
              placeholder="例如：查询 A 物料库存"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRun} disabled={running}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {running ? '运行中…' : '运行'}
          </button>
          {runResult ? <span className="text-xs text-zinc-500">{runResult.turns} 轮 / {runResult.totalDurationMs}ms</span> : null}
        </div>

        {runResult ? (
          <div className="space-y-3">
            {(runResult.toolCalls ?? []).map((tc, i) => (
              <div key={i} className="rounded-lg border p-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{tc.name}</span>
                  <span className="text-xs text-zinc-400">{tc.durationMs}ms</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <pre className="overflow-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">{JSON.stringify(tc.args, null, 2)}</pre>
                  <pre className="overflow-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">{typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}</pre>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="mb-1 text-xs font-semibold">最终回复</div>
              {runResult.reply}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}