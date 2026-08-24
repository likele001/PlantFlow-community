import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WorkflowNode } from '@/pages/WorkflowEditor'

type Props = {
  nodes: WorkflowNode[]
  selectedId?: string | null
}

export default function VariableDebugger({ nodes, selectedId }: Props) {
  const [triggerData, setTriggerData] = useState('{\n  "content": "手动测试",\n  "channel": "manual",\n  "type": "manual"\n}')

  const parsedTrigger = useMemo(() => {
    try { return JSON.parse(triggerData) }
    catch { return null }
  }, [triggerData])

  const [stepOutputs, setStepOutputs] = useState<Record<string, string>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const availableVars = useMemo(() => {
    const vars: { key: string; value: string; source: string }[] = []

    // Trigger vars
    if (parsedTrigger) {
      for (const [k, v] of Object.entries(parsedTrigger)) {
        vars.push({ key: `trigger.${k}`, value: JSON.stringify(v), source: 'trigger' })
      }
    }

    // Step vars (from user mock)
    for (const node of nodes) {
      const mock = stepOutputs[node.id]
      if (mock) {
        try {
          const parsed = JSON.parse(mock)
          if (typeof parsed === 'object' && parsed) {
            for (const [k, v] of Object.entries(parsed)) {
              vars.push({ key: `steps.${node.id}.${k}`, value: JSON.stringify(v), source: node.label })
            }
            vars.push({ key: `steps.${node.id}`, value: JSON.stringify(parsed), source: node.label })
          } else {
            vars.push({ key: `steps.${node.id}`, value: mock, source: node.label })
          }
        } catch {
          vars.push({ key: `steps.${node.id}`, value: mock, source: node.label })
        }
      }
    }

    // __last__ shortcut
    const lastNode = nodes[nodes.length - 1]
    if (lastNode && stepOutputs[lastNode.id]) {
      vars.push({ key: `steps.__last__.text`, value: '<最后节点输出>', source: '内置变量' })
    }

    // execution id
    vars.push({ key: '__execution_id', value: '<运行时自动生成>', source: '系统' })
    return vars
  }, [nodes, stepOutputs, parsedTrigger])

  // 预览变量替换
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedId), [nodes, selectedId])
  const previewResult = useMemo(() => {
    if (!selectedNode) return null
    const cfg = selectedNode.config ?? {}
    const templateStr = Object.entries(cfg)
      .filter(([_, v]) => typeof v === 'string')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    return templateStr
  }, [selectedNode])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold text-zinc-500">模拟触发数据</div>
        <textarea
          value={triggerData}
          onChange={e => setTriggerData(e.target.value)}
          rows={5}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] font-mono outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {!parsedTrigger && triggerData.trim() && (
          <div className="mt-1 text-[11px] text-red-500">JSON 格式错误</div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold text-zinc-500">节点模拟输出</div>
        <div className="space-y-2">
          {nodes.map(node => (
            <div key={node.id}>
              <button
                onClick={() => setExpandedStep(expandedStep === node.id ? null : node.id)}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <span className={cn(
                  'font-semibold',
                  selectedId === node.id && 'text-blue-600'
                )}>{node.label}</span>
                <span className="text-zinc-400">{stepOutputs[node.id] ? '✔' : '—'}</span>
              </button>
              {expandedStep === node.id && (
                <textarea
                  value={stepOutputs[node.id] ?? ''}
                  onChange={e => setStepOutputs(s => ({ ...s, [node.id]: e.target.value }))}
                  placeholder='{"text": "模拟输出内容"}'
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] font-mono outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900"
                />
              )}
            </div>
          ))}
          {!nodes.length && <div className="text-[11px] text-zinc-400">尚无节点</div>}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold text-zinc-500">可用变量</div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {availableVars.map(v => (
            <div key={v.key} className="flex items-center justify-between rounded px-1.5 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <code className="truncate font-semibold text-blue-600 dark:text-blue-400">{'{{'}{v.key}{'}}'}</code>
              <span className="ml-2 shrink-0 truncate text-zinc-400 max-w-[120px]" title={v.value}>{v.value}</span>
            </div>
          ))}
          {!availableVars.length && <div className="text-[11px] text-zinc-400">配置触发数据后显示</div>}
        </div>
      </div>

      {selectedNode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/10">
          <div className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400">当前节点配置预览</div>
          <pre className="whitespace-pre-wrap text-[11px] text-amber-800 dark:text-amber-300">{previewResult || '（无文本配置）'}</pre>
          <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-500">使用 {'{{variable}}'} 语法引用上方变量</div>
        </div>
      )}
    </div>
  )
}
