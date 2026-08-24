import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft, History, LayoutGrid, Loader2, Play, Plus, Save, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import FlowNode from '@/components/workflow/FlowNode'
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel'
import VariableDebugger from '@/components/workflow/VariableDebugger'
import {
  NODE_PALETTE,
  defaultNodeConfig,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@/lib/workflow-nodes'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'
import { autoLayout } from '@/lib/workflow-layout'

const DRAG_TYPE = 'application/workflow-node'

type Workflow = {
  id: string
  name: string
  status: 'draft' | 'published' | 'archived'
  definition?: WorkflowDefinition
}

type Kbase = { id: string; name: string }

const nodeTypes = { flow: FlowNode }

function nodeMeta(type: string, palette: typeof NODE_PALETTE) {
  return palette.find((p) => p.type === type) ?? NODE_PALETTE.find((p) => p.type === type)
}

function toFlowNodes(nodes: WorkflowNode[], palette: typeof NODE_PALETTE = NODE_PALETTE): Node[] {
  return nodes.map((n, i) => {
    const meta = nodeMeta(n.type, palette)
    const cases = (n.config?.cases ?? []) as { match: string; id: string }[]
    return {
      id: n.id,
      type: 'flow',
      position: n.position ?? { x: 80 + (i % 3) * 220, y: 60 + Math.floor(i / 3) * 120 },
      data: {
        label: n.label,
        nodeType: n.type,
        color: meta?.color ?? '#71717a',
        branch: meta?.outputs === 'branch',
        switchCases: n.type === 'logic.switch' ? cases : undefined,
        loop: n.type === 'logic.loop',
      },
    }
  })
}

function toFlowEdges(edges: WorkflowDefinition['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    animated: true,
  }))
}

function fromFlow(defNodes: WorkflowNode[], rfNodes: Node[], rfEdges: Edge[]): WorkflowDefinition {
  const posMap = new Map(rfNodes.map((n) => [n.id, n.position]))
  const nodes = defNodes.map((n) => ({
    ...n,
    position: posMap.get(n.id) ?? n.position,
  }))
  const edges = rfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }))
  return { nodes, edges }
}

type EditDiff = { added: WorkflowNode[]; removed: WorkflowNode[]; changed: WorkflowNode[] }

// N3.2: 对比修改前后定义，输出新增/删除/修改的节点（用于 AI 改图的变更预览）
function diffDefinitions(before: WorkflowDefinition, after: WorkflowDefinition): EditDiff {
  const bm = new Map(before.nodes.map((n) => [n.id, n]))
  const am = new Map(after.nodes.map((n) => [n.id, n]))
  const added = after.nodes.filter((n) => !bm.has(n.id))
  const removed = before.nodes.filter((n) => !am.has(n.id))
  const changed = after.nodes.filter((n) => {
    const b = bm.get(n.id)
    if (!b) return false
    return b.type !== n.type || b.label !== n.label || JSON.stringify(b.config) !== JSON.stringify(n.config)
  })
  return { added, removed, changed }
}

// N3.2: 应用 AI 结果时保留原节点位置，避免布局跳动
function mergePreview(before: WorkflowDefinition, after: WorkflowDefinition): WorkflowDefinition {
  const posMap = new Map(before.nodes.map((n) => [n.id, n.position]))
  const nodes = after.nodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }))
  return { nodes, edges: after.edges }
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token, tenant } = useAuthStore()
  const [item, setItem] = useState<Workflow | null>(null)
  const [defNodes, setDefNodes] = useState<WorkflowNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [kbases, setKbases] = useState<Kbase[]>([])
  const [connectors, setConnectors] = useState<{ id: string; name: string }[]>([])
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([])
  const [palette, setPalette] = useState(NODE_PALETTE)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiHint, setAiHint] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSource, setAiSource] = useState<'llm' | 'fallback' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editPreview, setEditPreview] = useState<{ definition: WorkflowDefinition; changes: string[]; source: string } | null>(null)
  const [editBackup, setEditBackup] = useState<WorkflowDefinition | null>(null)
  const [versions, setVersions] = useState<{ id: string; version: number; createdAt: string; note?: string; isCurrent?: boolean }[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [paletteQ, setPaletteQ] = useState('')
  const [rightPanelTab, setRightPanelTab] = useState<'config' | 'vars'>('config')
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  const selected = useMemo(() => defNodes.find((n) => n.id === selectedId) ?? null, [defNodes, selectedId])

  // N3.2: AI 改图 — 修改前后节点 diff
  const editDiff = useMemo(() => {
    if (!editPreview || !editBackup) return null
    return diffDefinitions(editBackup, editPreview.definition)
  }, [editPreview, editBackup])

  const load = useCallback(async () => {
    if (!token || !id) return
    const [wfRes, kbRes, verRes, connRes, wfListRes, palRes] = await Promise.all([
      apiRequest<Workflow>(`/api/workflows/${id}`, { token }),
      apiRequest<Kbase[]>('/api/knowledge/bases', { token }),
      apiRequest<{ id: string; version: number; createdAt: string; note?: string; isCurrent?: boolean }[]>(`/api/workflows/${id}/versions`, { token }),
      apiRequest<{ id: string; name: string }[]>('/api/connectors', { token }),
      apiRequest<{ id: string; name: string }[]>('/api/workflows', { token }),
      apiRequest<{ type: string; label: string; group: string; color: string; outputs?: number | 'branch' }[]>('/api/engine/nodes', { token }),
    ])
    if (!('data' in wfRes)) {
      setErr(wfRes.error)
      return
    }
    setItem(wfRes.data)
    const nodes = wfRes.data.definition?.nodes ?? []
    const edges = wfRes.data.definition?.edges ?? []
    const pal =
      'data' in palRes && palRes.data.length
        ? (palRes.data as typeof NODE_PALETTE)
        : NODE_PALETTE
    setPalette(pal)
    setDefNodes(nodes)
    setRfNodes(toFlowNodes(nodes, pal))
    setRfEdges(toFlowEdges(edges))
    if ('data' in kbRes) setKbases(kbRes.data)
    if ('data' in verRes) setVersions(verRes.data)
    if ('data' in connRes) setConnectors(connRes.data)
    if ('data' in wfListRes) setWorkflows(wfListRes.data.filter((w) => w.id !== id))
  }, [id, token, setRfNodes, setRfEdges])

  async function rollback(versionId: string) {
    if (!token || !id || !confirm('回滚将用该版本覆盖当前草稿，确定？')) return
    const res = await apiRequest<Workflow>(`/api/workflows/${id}/rollback/${versionId}`, { method: 'POST', token })
    if ('data' in res) {
      setMsg(`已回滚到历史版本`)
      void load()
    } else setErr(res.error)
  }

  useEffect(() => {
    void load()
  }, [load])

  const onConnect = useCallback(
    (conn: Connection) => {
      setRfEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${conn.source}-${conn.sourceHandle ?? 'o'}-${conn.target}`,
            animated: true,
          },
          eds,
        ),
      )
    },
    [setRfEdges],
  )

  function applyDefinition(definition: WorkflowDefinition) {
    setDefNodes(definition.nodes)
    setRfNodes(toFlowNodes(definition.nodes, palette))
    setRfEdges(toFlowEdges(definition.edges))
    setSelectedId(definition.nodes[0]?.id ?? null)
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 100)
  }

  function addNode(type: string, label: string, position?: { x: number; y: number }) {
    const pos =
      position ??
      (rfRef.current
        ? rfRef.current.screenToFlowPosition({
            x: window.innerWidth / 2 - 100,
            y: window.innerHeight / 2 - 80,
          })
        : { x: 120 + defNodes.length * 40, y: 100 + defNodes.length * 30 })
    const n: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label,
      config: defaultNodeConfig(type),
      position: pos,
    }
    setDefNodes((prev) => [...prev, n])
    setRfNodes((prev) => [...prev, ...toFlowNodes([n], palette)])
    setSelectedId(n.id)
  }

  function duplicateSelected() {
    if (!selected) return
    const copy: WorkflowNode = {
      ...selected,
      id: crypto.randomUUID(),
      label: `${selected.label} 副本`,
      position: { x: (selected.position?.x ?? 0) + 40, y: (selected.position?.y ?? 0) + 40 },
      config: { ...selected.config },
    }
    setDefNodes((prev) => [...prev, copy])
    setRfNodes((prev) => [...prev, ...toFlowNodes([copy], palette)])
    setSelectedId(copy.id)
  }

  function deleteSelected() {
    if (!selectedId) return
    setDefNodes((prev) => prev.filter((n) => n.id !== selectedId))
    setRfNodes((prev) => prev.filter((n) => n.id !== selectedId))
    setRfEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }

  function onDragStart(e: React.DragEvent, type: string, label: string) {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type, label }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(DRAG_TYPE)
      if (!raw || !rfRef.current) return
      try {
        const { type, label } = JSON.parse(raw) as { type: string; label: string }
        const position = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        addNode(type, label, position)
      } catch { /* ignore */ }
    },
    [defNodes.length, palette],
  )

  function updateSelectedConfig(key: string, value: unknown) {
    if (!selectedId) return
    setDefNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== selectedId) return n
        if (key === '__label__') return { ...n, label: String(value) }
        return { ...n, config: { ...n.config, [key]: value } }
      })
      const updated = next.find((n) => n.id === selectedId)
      if (updated) {
        const cases = (updated.config.cases ?? []) as { match: string; id: string }[]
        setRfNodes((prevRf) =>
          prevRf.map((rn) =>
            rn.id === selectedId
              ? {
                  ...rn,
                  data: {
                    ...rn.data,
                    label: updated.label,
                    switchCases: updated.type === 'logic.switch' ? cases : rn.data?.switchCases,
                  },
                }
              : rn,
          ),
        )
      }
      return next
    })
  }

  async function save() {
    if (!token || !id) return
    setBusy(true)
    setErr(null)
    const definition = fromFlow(defNodes, rfNodes, rfEdges)
    const res = await apiRequest<Workflow>(`/api/workflows/${id}`, {
      method: 'PATCH',
      token,
      body: { definition },
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setDefNodes(definition.nodes)
    setMsg('已保存')
  }


  async function generateFromAI() {
    if (!aiDesc.trim()) {
      setErr('请输入需求描述')
      return
    }
    setAiBusy(true)
    setErr(null)
    try {
      const resp = await apiRequest<{ data: { name: string; definition: WorkflowDefinition; source: string } }>(
        '/api/ai-build/workflow',
        {
          method: 'POST',
          body: JSON.stringify({ description: aiDesc.trim(), hint: aiHint.trim() || undefined }),
        },
      )
      const def = resp.data.definition
      const nodesWithDefaults = def.nodes.map((n) => ({
        ...n,
        config: { ...(defaultNodeConfig(n.type) || {}), ...(n.config || {}) },
      }))
      applyDefinition({ nodes: nodesWithDefaults, edges: def.edges })
      setAiSource((resp.data.source as 'llm' | 'fallback') ?? 'fallback')
      setMsg(`已加载 AI 生成的工作流（来源：${resp.data.source === 'llm' ? 'AI 模型' : '结构化模板'}）`)
      setAiOpen(false)
      setAiDesc('')
      setAiHint('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 生成失败')
    } finally {
      setAiBusy(false)
    }
  }

  // N3.2: AI 改图 — 基于当前画布定义 + 修改指令，生成修改预览
  async function editFromAI() {
    if (!editDesc.trim()) {
      setErr('请输入修改指令')
      return
    }
    setEditBusy(true)
    setErr(null)
    try {
      const current = fromFlow(defNodes, rfNodes, rfEdges)
      setEditBackup(current)
      const resp = await apiRequest<{
        data: { name: string; definition: WorkflowDefinition; changes: string[]; source: string }
      }>('/api/ai-build/workflow/edit', {
        method: 'POST',
        body: JSON.stringify({ description: editDesc.trim(), definition: current }),
      })
      const def = resp.data.definition
      const nodesWithDefaults = def.nodes.map((n) => ({
        ...n,
        config: { ...(defaultNodeConfig(n.type) || {}), ...(n.config || {}) },
      }))
      const merged = mergePreview(current, { nodes: nodesWithDefaults, edges: def.edges })
      setEditPreview({ definition: merged, changes: resp.data.changes ?? [], source: resp.data.source })
      applyDefinition(merged)
      setEditDesc('')
      setMsg(
        resp.data.source === 'llm'
          ? 'AI 已生成修改预览（当前为未保存的预览），确认后点击「应用修改」'
          : 'AI 未能生成修改，已恢复原图，请调整指令重试',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 改图失败')
    } finally {
      setEditBusy(false)
    }
  }

  function applyEditPreview() {
    setEditPreview(null)
    setEditBackup(null)
    setEditOpen(false)
    setMsg('AI 修改已应用到画布（未保存），记得点击保存')
  }

  function revertEditPreview() {
    if (editBackup) applyDefinition(editBackup)
    setEditPreview(null)
    setEditBackup(null)
    setEditOpen(false)
    setMsg('已恢复原图')
  }

  async function publish() {
    await save()
    if (!token || !id) return
    const nextV = (versions[0]?.version ?? 0) + 1
    const note = window.prompt('发布备注（可选，记录本次改动；留空则默认）', `v${nextV}`)
    if (note === null) return
    setBusy(true)
    const res = await apiRequest<Workflow>(`/api/workflows/${id}/publish`, {
      method: 'POST',
      token,
      body: { note: note.trim() || undefined },
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setItem((s) => (s ? { ...s, status: 'published' } : s))
    setMsg(`已发布 v${nextV}，Webhook/Cron 触发器已同步`)
    void load()
  }

  async function runOnce() {
    if (!token || !id) return
    setBusy(true)
    const res = await apiRequest<{ jobId: string }>(`/api/workflows/${id}/run`, {
      method: 'POST',
      token,
      body: { triggerData: { type: 'manual', content: '手动测试', channel: 'manual' } },
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setMsg('已提交执行队列')
    setTimeout(() => navigate('/executions'), 800)
  }

  const groups = useMemo(() => {
    const q = paletteQ.trim().toLowerCase()
    const m = new Map<string, typeof NODE_PALETTE>()
    for (const p of palette) {
      if (q && !p.label.toLowerCase().includes(q) && !p.type.toLowerCase().includes(q)) continue
      if (!m.has(p.group)) m.set(p.group, [])
      m.get(p.group)!.push(p)
    }
    return [...m.entries()]
  }, [palette, paletteQ])

  function layoutGraph() {
    const definition = autoLayout(fromFlow(defNodes, rfNodes, rfEdges))
    applyDefinition(definition)
    setMsg('已自动排列')
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-3">
      <div className="flex flex-shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/workflows"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs text-zinc-500">流程编排</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {item?.name ?? '工作流'}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  item?.status === 'published' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10',
                )}
              >
                {item?.status === 'published' ? '已发布' : '草稿'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAiOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-amber-400/60 bg-amber-50 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-400/10" title="用自然语言描述，让 AI 生成工作流">
            <Sparkles className="h-4 w-4" /> AI 生成
          </button>
          <button type="button" onClick={() => setEditOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-sky-400/60 bg-sky-50 px-3 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-400/10" title="基于当前画布用自然语言修改工作流（AI 改图）">
            <Sparkles className="h-4 w-4" /> AI 改图
          </button>
          <button type="button" onClick={() => layoutGraph()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold" title="自动排列">
            <LayoutGrid className="h-4 w-4" /> 排列
          </button>
          <button type="button" onClick={() => setShowVersions((s) => !s)} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold">
            <History className="h-4 w-4" /> 版本
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
            <Save className="h-4 w-4" /> 保存
          </button>
          <button type="button" disabled={busy} onClick={() => void publish()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
            发布
          </button>
          <button type="button" disabled={busy} onClick={() => void runOnce()} className="inline-flex h-9 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">
            <Play className="h-4 w-4" /> 运行
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-700">{err}</div> : null}
      {msg ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-700">{msg}</div> : null}

      {aiOpen ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50/40 p-5 shadow-sm dark:border-amber-400/30 dark:bg-amber-400/5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <div className="text-sm font-semibold">AI 生成工作流</div>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">N3 Beta</span>
            </div>
            <button type="button" onClick={() => !aiBusy && setAiOpen(false)} className="rounded-lg p-1 hover:bg-amber-100 dark:hover:bg-amber-400/20">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">需求描述</label>
              <textarea
                value={aiDesc}
                onChange={(e) => setAiDesc(e.target.value)}
                disabled={aiBusy}
                rows={3}
                placeholder="例如：每天 9 点拉取库存数据，AI 生成日报后发到飞书群"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">补充提示（可选）</label>
              <input
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
                disabled={aiBusy}
                placeholder="如：使用 http.request 拉取 /api/inventory；日报发到 feishu:chat_id"
                className="mt-1 h-9 w-full rounded-xl border bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">
                AI 将按节点类型枚举生成 {`{nodes, edges}`} 结构，生成后可在画布上微调
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={aiBusy} onClick={() => setAiOpen(false)} className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50">
                  取消
                </button>
                <button type="button" disabled={aiBusy || !aiDesc.trim()} onClick={() => void generateFromAI()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiBusy ? '生成中…' : '生成草稿'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div className="rounded-2xl border border-sky-300/60 bg-sky-50/40 p-5 shadow-sm dark:border-sky-400/30 dark:bg-sky-400/5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <div className="text-sm font-semibold">AI 改图</div>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700">N3.2 Beta</span>
            </div>
            <button type="button" onClick={() => !editBusy && !editPreview && setEditOpen(false)} className="rounded-lg p-1 hover:bg-sky-100 dark:hover:bg-sky-400/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!editPreview ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">修改指令</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  disabled={editBusy}
                  rows={3}
                  placeholder="例如：把 AI 对话节点换成知识库检索；定时改为每天早上 8 点；在流程末尾加一个消息推送节点"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">AI 将基于当前画布定义做增量修改，生成后先预览，确认后再应用</div>
                <div className="flex gap-2">
                  <button type="button" disabled={editBusy} onClick={() => setEditOpen(false)} className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50">
                    取消
                  </button>
                  <button type="button" disabled={editBusy || !editDesc.trim()} onClick={() => void editFromAI()} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                    {editBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {editBusy ? '修改中…' : '生成修改预览'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700">
                  新增 {editDiff?.added.length ?? 0}
                </span>
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-700">
                  删除 {editDiff?.removed.length ?? 0}
                </span>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700">
                  修改 {editDiff?.changed.length ?? 0}
                </span>
                <span className="text-zinc-400">画布上为预览效果，可继续手动微调</span>
              </div>

              {editPreview.changes.length ? (
                <div className="rounded-xl bg-white p-3 text-xs dark:bg-zinc-950">
                  <div className="mb-1 font-semibold text-zinc-500">AI 修改说明</div>
                  <ul className="space-y-1">
                    {editPreview.changes.map((c, i) => (
                      <li key={i} className="flex gap-1.5 text-zinc-600 dark:text-zinc-400">
                        <span className="text-sky-500">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {editDiff && (editDiff.added.length || editDiff.removed.length || editDiff.changed.length) ? (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-white p-3 text-xs dark:bg-zinc-950">
                  {editDiff.added.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700">+</span>
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{n.label ?? n.type}</span>
                      <span className="text-zinc-400">{n.type}</span>
                    </div>
                  ))}
                  {editDiff.removed.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-700">−</span>
                      <span className="font-medium text-zinc-400 line-through">{n.label ?? n.type}</span>
                      <span className="text-zinc-400">{n.type}</span>
                    </div>
                  ))}
                  {editDiff.changed.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-700">~</span>
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{n.label ?? n.type}</span>
                      <span className="text-zinc-400">{n.type}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={revertEditPreview} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  恢复原图
                </button>
                <button type="button" onClick={applyEditPreview} className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">
                  应用修改
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showVersions ? (
        <div className="rounded-xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">发布历史</div>
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm dark:border-zinc-800">
                <div className="min-w-0">
                  <span className="font-semibold">v{v.version}</span>
                  {v.isCurrent ? (
                    <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">当前生效</span>
                  ) : null}
                  {v.note ? <span className="ml-2 text-xs text-zinc-400">{v.note}</span> : null}
                  <div className="mt-0.5 text-xs text-zinc-500">{new Date(v.createdAt).toLocaleString()}</div>
                </div>
                {v.isCurrent ? (
                  <span className="shrink-0 text-xs text-zinc-400">生效中</span>
                ) : (
                  <button type="button" onClick={() => void rollback(v.id)} className="shrink-0 text-xs font-semibold text-blue-600">
                    回滚到此版本
                  </button>
                )}
              </div>
            ))}
            {!versions.length ? <div className="text-sm text-zinc-500">发布后将在此保留版本快照</div> : null}
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_1fr_300px]">
        <div className="flex flex-col overflow-hidden rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b p-3 dark:border-zinc-800">
            <div className="text-sm font-semibold">节点库</div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                placeholder="搜索节点…"
                className="h-8 w-full rounded-lg border pl-8 pr-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">拖到画布，或点击添加</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-3 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">模板</div>
              {WORKFLOW_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyDefinition(t.build())}
                  className="w-full rounded-lg border px-2 py-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-[10px] text-zinc-500">{t.description}</div>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {groups.map(([group, items]) => (
                <div key={group}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{group}</div>
                  <div className="mt-1 space-y-1">
                    {items.map((it) => (
                      <div
                        key={it.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, it.type, it.label)}
                        onClick={() => addNode(it.type, it.label)}
                        className="flex cursor-grab items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs active:cursor-grabbing hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                        <span className="flex-1 font-medium">{it.label}</span>
                        <Plus className="h-3 w-3 text-zinc-400" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {!defNodes.length ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-2xl border border-dashed bg-white/90 p-6 text-center shadow-sm backdrop-blur dark:bg-zinc-950/90">
                <div className="text-lg font-semibold">从空白开始</div>
                <p className="mt-2 text-sm text-zinc-500">拖拽左侧节点到画布，或选一个模板快速开始</p>
              </div>
            </div>
          ) : null}
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => { rfRef.current = inst }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodesDelete={(deleted) => {
              const ids = new Set(deleted.map((n) => n.id))
              setDefNodes((prev) => prev.filter((n) => !ids.has(n.id)))
              if (selectedId && ids.has(selectedId)) setSelectedId(null)
            }}
            onEdgesDelete={(deleted) => {
              const ids = new Set(deleted.map((e) => e.id))
              setRfEdges((prev) => prev.filter((e) => !ids.has(e.id)))
            }}
          >
            <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
            <Controls showInteractive />
            <MiniMap zoomable pannable className="!bg-zinc-100 dark:!bg-zinc-900" />
          </ReactFlow>
        </div>

        <div className="overflow-y-auto rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <button
              onClick={() => setRightPanelTab('config')}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition',
                rightPanelTab === 'config'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900',
              )}
            >
              节点配置
            </button>
            <button
              onClick={() => setRightPanelTab('vars')}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition',
                rightPanelTab === 'vars'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900',
              )}
            >
              变量调试
            </button>
          </div>
          <div className="mt-3">
            {rightPanelTab === 'config' ? (
              <NodeConfigPanel
                node={selected}
                nodes={defNodes}
                kbases={kbases}
                connectors={connectors}
                workflows={workflows}
                tenantId={tenant?.id}
                onChange={updateSelectedConfig}
                onDuplicate={selected ? duplicateSelected : undefined}
                onDelete={selected ? deleteSelected : undefined}
              />
            ) : (
              <VariableDebugger nodes={defNodes} selectedId={selectedId} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export type { WorkflowNode }
