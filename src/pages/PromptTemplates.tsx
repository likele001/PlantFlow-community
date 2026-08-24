import { useEffect, useState } from 'react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Copy, History, XCircle, Loader2 } from 'lucide-react'

type PromptTemplate = {
  id: string
  name: string
  description: string
  systemPrompt: string
  userPrompt: string
  variables: { key: string; label: string; type: string; options?: string[]; default?: string }[]
  tags: string[]
  version: number
  isLatest: boolean
  sourceId: string | null
  createdAt: string
  updatedAt: string
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center sm:py-10" onClick={props.onClose}>
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="text-lg font-semibold">{props.title}</div>
          <button onClick={props.onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-4">{props.children}</div>
      </div>
    </div>
  )
}

export default function PromptTemplates() {
  const { token, user } = useAuthStore()
  const [list, setList] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [versions, setVersions] = useState<PromptTemplate[] | null>(null)

  async function refresh() {
    setLoading(true)
    const r = await apiRequest<PromptTemplate[]>('/api/prompts', { token })
    if (r.success) setList(r.data)
    setLoading(false)
  }
  useEffect(() => { void refresh() }, [token])

  async function remove(tpl: PromptTemplate) {
    if (!confirm(`删除「${tpl.name}」？`)) return
    const r = await apiRequest(`/api/prompts/${tpl.id}`, { method: 'DELETE', token })
    if (r.success) refresh()
  }

  async function showVersions(tpl: PromptTemplate) {
    const r = await apiRequest<PromptTemplate[]>(`/api/prompts/${tpl.id}/versions`, { token })
    if (r.success) setVersions(r.data)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">AI · Prompt 模板</div>
          <div className="mt-2 text-2xl font-semibold">提示词模板管理</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">管理和版本控制 AI 提示词模板，可在工作流中引用。</div>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
          <Plus className="h-4 w-4" /> 新建模板
        </button>
      </div>

      {loading && list.length === 0 ? <div className="text-sm text-zinc-500">加载中...</div> : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">还没有 Prompt 模板。</div>
      ) : (
        <div className="grid gap-3">
          {list.map(tpl => (
            <div key={tpl.id} className="flex items-start justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">{tpl.name}</div>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">v{tpl.version}</span>
                </div>
                {tpl.description && <div className="mt-1 text-xs text-zinc-500">{tpl.description}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {tpl.tags.map(tag => <span key={tag} className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{tag}</span>)}
                  {tpl.variables.map(v => <span key={v.key} className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{'{'}{v.key}{'}'}</span>)}
                </div>
                <div className="mt-2 max-h-16 overflow-hidden text-ellipsis whitespace-pre-wrap text-[11px] text-zinc-400">{tpl.systemPrompt}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => showVersions(tpl)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-800"><History className="h-3 w-3 inline mr-1" />历史</button>
                <button onClick={() => { setEditing(tpl); setShowForm(true) }} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-800"><Pencil className="h-3 w-3 inline mr-1" />编辑</button>
                <button onClick={() => remove(tpl)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50"><Trash2 className="h-3 w-3 inline mr-1" />删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <PromptForm mode={editing ? 'edit' : 'create'} template={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); refresh() }} />}

      {versions && (
        <Modal title="版本历史" onClose={() => setVersions(null)}>
          <div className="space-y-2">
            {versions.map(v => (
              <div key={v.id} className={`rounded-xl border p-4 ${v.isLatest ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{v.version}</span>
                  {v.isLatest && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40">最新</span>}
                  <span className="text-[11px] text-zinc-400">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">{v.systemPrompt}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function PromptForm(props: { mode: 'create' | 'edit'; template: PromptTemplate | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuthStore()
  const [name, setName] = useState(props.template?.name ?? '')
  const [description, setDescription] = useState(props.template?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(props.template?.systemPrompt ?? '')
  const [userPrompt, setUserPrompt] = useState(props.template?.userPrompt ?? '')
  const [tagsStr, setTagsStr] = useState((props.template?.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    setSaving(true)
    const body = { name, description, systemPrompt, userPrompt, tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean) }
    if (props.mode === 'create') {
      const r = await apiRequest('/api/prompts', { method: 'POST', token, body })
      setSaving(false)
      if (r.success) props.onSaved()
      else setErr(r.error)
    } else {
      const r = await apiRequest(`/api/prompts/${props.template!.id}`, { method: 'PATCH', token, body })
      setSaving(false)
      if (r.success) props.onSaved()
      else setErr(r.error)
    }
  }

  return (
    <Modal title={props.mode === 'create' ? '新建 Prompt 模板' : '编辑 Prompt 模板'} onClose={props.onClose}>
      <div className="space-y-4">
        <label className="block">
          <div className="mb-1 text-xs text-zinc-500">名称</div>
          <input value={name} onChange={e => setName(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-zinc-500">描述</div>
          <input value={description} onChange={e => setDescription(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-zinc-500">标签（逗号分隔）</div>
          <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="客服, 知识库, 问答" className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-zinc-500">System Prompt</div>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-zinc-500">User Prompt</div>
          <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950" />
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800">取消</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}保存
          </button>
        </div>
      </div>
    </Modal>
  )
}
