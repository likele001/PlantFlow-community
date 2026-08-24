import { useEffect, useState } from 'react'
import type { NodeConfigProps } from './types'
import { Plus, Trash2 } from 'lucide-react'

/**
 * N6 增强：workflow.sub 配置面板
 *  - 目标工作流（父级已过滤当前流，防自调用）
 *  - 最大嵌套深度 maxDepth
 *  - 输入映射：把父流程变量（{{trigger.xxx}} / {{steps.node.xxx}} / {{vars.xxx}}）映射为子工作流触发字段
 * 注意：inputMapping 是嵌套对象，父级 VariablePicker 的追加机制只支持顶层 string 字段，
 * 故此处行内编辑不依赖 onFocusField，未配置映射时透传父流程触发数据。
 */
export default function WorkflowSubConfig({ node, workflows = [], onChange }: NodeConfigProps) {
  const mapping = (node.config.inputMapping ?? {}) as Record<string, string>
  const [rows, setRows] = useState<Array<{ k: string; v: string }>>(Object.entries(mapping))

  // 仅切换节点时重置编辑态；避免依赖 inputMapping 引用（写入即新建对象会打断输入）
  useEffect(() => {
    setRows(Object.entries((node.config.inputMapping ?? {}) as Record<string, string>))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  function commit(rs: Array<{ k: string; v: string }>) {
    setRows(rs)
    const obj: Record<string, string> = {}
    rs.forEach((r) => { if (r.k.trim()) obj[r.k.trim()] = r.v })
    onChange('inputMapping', obj)
  }

  function updateRow(i: number, patch: Partial<{ k: string; v: string }>) {
    commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function updateDepth(v: string) {
    const n = Number(v)
    onChange('maxDepth', Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3)
  }

  return (
    <div className="space-y-4">
      <label className="block text-xs text-zinc-500">
        目标工作流
        <select
          value={String(node.config.targetWorkflowId ?? '')}
          onChange={(e) => onChange('targetWorkflowId', e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">请选择已发布的工作流</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span className="mt-1 block text-[10px] text-zinc-400">目标工作流需已发布；当前工作流已自动排除，避免自调用循环。</span>
      </label>

      <label className="block text-xs text-zinc-500">
        最大嵌套深度
        <input
          type="number"
          min={1}
          max={5}
          value={String(node.config.maxDepth ?? 3)}
          onChange={(e) => updateDepth(e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        />
        <span className="mt-1 block text-[10px] text-zinc-400">子工作流内的子工作流最多可嵌套到该深度（1–5），防止循环。</span>
      </label>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-zinc-500">输入映射（父变量 → 子工作流触发字段）</span>
          <button
            type="button"
            onClick={() => commit([...rows, { k: '', v: '{{trigger.content}}' }])}
            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Plus className="h-3 w-3" /> 添加映射
          </button>
        </div>
        {rows.length === 0 && (
          <p className="text-[11px] text-zinc-400">未配置映射时，子工作流将透传父流程的触发数据。</p>
        )}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={r.k}
                onChange={(e) => updateRow(i, { k: e.target.value })}
                placeholder="子字段名"
                className="mt-0 h-9 w-28 rounded-xl border border-zinc-200 bg-white px-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              />
              <input
                value={r.v}
                onChange={(e) => updateRow(i, { v: e.target.value })}
                placeholder="{{trigger.content}}"
                spellCheck={false}
                className="h-9 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-mono dark:border-zinc-800 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => commit(rows.filter((_, idx) => idx !== i))}
                className="mt-0 rounded-lg border px-2 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                title="删除映射"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
          值可含变量：<code className="font-mono text-zinc-500">{"{{trigger.content}}"}</code>{' '}
          <code className="font-mono text-zinc-500">{"{{steps.<节点id>.text}}"}</code>{' '}
          <code className="font-mono text-zinc-500">{"{{vars.<key>}}"}</code>
        </p>
      </div>
    </div>
  )
}