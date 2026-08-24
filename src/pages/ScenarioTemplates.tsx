import { useEffect, useState } from 'react'
import { apiRequest } from '@/utils/api'
import { Check, Import, Package, Sparkles } from 'lucide-react'

type Tpl = {
  id: string
  industry: string
  name: string
  description: string
  icon: string
  steps: string[]
  isBuiltin: boolean
  workflowId: string | null
  imported: boolean
  importedScenarioId: string | null
  createdAt: string
}
type Industry = { industry: string; count: number }
type ImportResult = {
  alreadyImported: boolean
  scenarioId: string
  agentId: string | null
  workflowId: string | null
  name: string
}

export default function ScenarioTemplates() {
  const token = localStorage.getItem('wf_auth') ? JSON.parse(localStorage.getItem('wf_auth')!).token : null
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [industries, setIndustries] = useState<Industry[]>([])
  const [active, setActive] = useState<string>('全部')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    const [list, ind] = await Promise.all([
      apiRequest<any>('/api/scenarios', { token }),
      apiRequest<Industry[]>('/api/scenarios/industries', { token }),
    ])
    if (list.success) setTemplates(list.data?.templates ?? [])
    else setError(list.error ?? '加载失败')
    if (ind.success) setIndustries(ind.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const doImport = async (id: string) => {
    setImportingId(id)
    setError('')
    const r = await apiRequest<ImportResult>(`/api/scenarios/${id}/import`, { method: 'POST', token })
    setImportingId(null)
    if (r.success) {
      const d = r.data!
      setToast(`「${d.name}」${d.alreadyImported ? '已存在，无需重复导入' : '导入成功'}`)
      await load()
    } else {
      setError(r.error ?? '导入失败')
    }
  }

  const filtered = active === '全部' ? templates : templates.filter((t) => t.industry === active)
  const importedCount = templates.filter((t) => t.imported).length

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">分行业场景模板</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            按行业一键导入，直接生成可用的 Agent 或工作流，免从空白画布起步。
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <Package className="mr-1 inline h-4 w-4" />
          已导入 <span className="font-semibold text-indigo-600">{importedCount}</span> / {templates.length}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {!error && toast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {toast}
        </div>
      )}

      {/* 行业筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[{ industry: '全部', count: templates.length }, ...industries].map((it) => {
          const isActive = active === it.industry
          return (
            <button
              key={it.industry}
              onClick={() => setActive(it.industry)}
              className={cnChip(isActive)}
            >
              {it.industry}
              <span className="ml-1.5 rounded-full px-1.5 text-[11px] font-semibold" style={{ background: isActive ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.06)' }}>
                {it.count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-zinc-400">该行业暂无模板</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{t.icon}</span>
                {t.imported ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Check className="h-3 w-3" /> 已导入
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {t.industry}
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{t.description}</p>

              {t.steps && t.steps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.steps.map((s, i) => (
                    <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => doImport(t.id)}
                disabled={t.imported || importingId === t.id}
                className={
                  t.imported
                    ? 'mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400 dark:bg-zinc-800'
                    : 'mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60'
                }
              >
                {importingId === t.id ? (
                  '导入中…'
                ) : t.imported ? (
                  <>已导入</>
                ) : (
                  <>
                    <Import className="h-4 w-4" /> 一键导入
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <b>提示：</b>用查询类工具的模板（库存/工单/QMS 等），导入后请到「数据接入」配置数据源，再到「Agent 调试」把对应 Agent 授权给该数据源，才能真正查到数据。
        </div>
      </div>
    </div>
  )
}

function cnChip(active: boolean) {
  return (
    'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition ' +
    (active
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300')
  )
}