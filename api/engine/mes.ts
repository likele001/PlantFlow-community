import { validateUrl } from './ssrf.js'
import type { WorkflowDefinition } from './types.js'

export type MesCallbackInput = {
  tenantId: string
  workflowId: string
  def: WorkflowDefinition
  execution: { id: string; status: 'success' | 'failed'; error?: string | null }
  trigger: Record<string, unknown>
  steps: Record<string, unknown>
}

/**
 * O5: MES 结果写回 — 工作流执行完成后，把执行结果回调到 trigger.mes 节点配置的 callbackUrl。
 * - 回调地址支持模板变量渲染：{{trigger.xxx}} / {{steps.xxx}} / {{status}}
 * - 自定义请求头 callbackHeaders 为 JSON 字符串（如 {"Authorization":"Bearer xxx"}）
 * - 走 validateUrl SSRF 校验（拒绝内网/保留地址），与 http.request 节点一致
 * - fire-and-forget：不阻塞主流程；失败仅记录日志，不重试
 */
export async function sendMesResultCallback(input: MesCallbackInput): Promise<void> {
  const mesNodes = input.def.nodes.filter((n) => n.type === 'trigger.mes')
  for (const node of mesNodes) {
    const cfg = (node.config ?? {}) as Record<string, unknown>
    const callbackUrl = String(cfg.callbackUrl ?? '').trim()
    if (!callbackUrl) continue

    const method = String(cfg.callbackMethod ?? 'POST').trim().toUpperCase() || 'POST'
    const headersRaw = String(cfg.callbackHeaders ?? '').trim()

    const payload = {
      executionId: input.execution.id,
      workflowId: input.workflowId,
      tenantId: input.tenantId,
      status: input.execution.status,
      event: String(cfg.event ?? ''),
      error: input.execution.error ?? null,
      trigger: input.trigger,
      steps: input.steps,
      finishedAt: new Date().toISOString(),
    }

    const rendered = renderTemplate(callbackUrl, {
      status: input.execution.status,
      trigger: input.trigger,
      steps: input.steps,
    })

    let headers: Record<string, string> = {}
    if (headersRaw) {
      try {
        headers = JSON.parse(headersRaw)
      } catch {
        console.error('[mes] callbackHeaders 不是合法 JSON，已忽略:', headersRaw)
      }
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json'
    }

    try {
      const url = validateUrl(rendered)
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        console.error(`[mes] 结果写回失败 status=${res.status} url=${rendered}`)
      }
    } catch (e) {
      console.error('[mes] 结果写回异常:', e instanceof Error ? e.message : e)
    }
  }
}

function renderTemplate(tpl: string, scope: Record<string, unknown>): string {
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    const parts = key.split('.')
    let v: unknown = scope
    for (const p of parts) {
      if (v && typeof v === 'object' && p in (v as Record<string, unknown>)) {
        v = (v as Record<string, unknown>)[p]
      } else {
        return `{{${key}}}`
      }
    }
    return v == null ? '' : String(v)
  })
}
