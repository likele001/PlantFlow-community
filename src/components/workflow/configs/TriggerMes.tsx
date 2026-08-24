import { useState } from 'react'
import { Field, type NodeConfigProps } from './types'

export default function TriggerMesConfig({ node, tenantId, onChange, onFocusField }: NodeConfigProps) {
  const event = String(node.config.event ?? '')
  const secret = String(node.config.secret ?? '')
  const callbackUrl = String(node.config.callbackUrl ?? '')
  const callbackMethod = String(node.config.callbackMethod ?? 'POST')
  const callbackHeaders = String(node.config.callbackHeaders ?? '')
  const base = window.location.origin

  return (
    <div className="space-y-3">
      <Field
        label="事件名称"
        value={event}
        placeholder="如 mes.order.created / mes.production.report"
        onChange={(v) => onChange('event', v)}
        onPickVar={() => onFocusField('event')}
      />
      {tenantId && event ? (
        <CopyBox
          title="事件上报地址（MES → 平台，POST）"
          text={`${base}/api/hooks/${tenantId}/events/${event}`}
        />
      ) : null}

      <Field
        label="调用密钥（可选，MES 上报时需带 x-webhook-secret）"
        value={secret}
        onChange={(v) => onChange('secret', v)}
      />

      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-semibold text-zinc-500">结果写回（平台 → MES）</div>
        <Field
          label="回调地址（MES API，支持 {{trigger.xxx}} / {{steps.xxx}} / {{status}} 模板）"
          value={callbackUrl}
          placeholder="如 https://mes.example.com/api/v1/workflow-result"
          onChange={(v) => onChange('callbackUrl', v)}
          onPickVar={() => onFocusField('callbackUrl')}
        />
        <div className="mt-2">
          <label className="block text-xs text-zinc-500">回调方法</label>
          <div className="mt-1 flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
            {(['POST', 'PUT', 'GET'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange('callbackMethod', m)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  callbackMethod === m
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          <Field
            label="回调请求头（JSON，可选）"
            value={callbackHeaders}
            placeholder='{"Authorization":"Bearer xxx"}'
            onChange={(v) => onChange('callbackHeaders', v)}
            multiline
          />
        </div>
        {callbackUrl ? (
          <div className="mt-1 rounded-lg bg-zinc-50 p-2 text-[11px] text-zinc-500 dark:bg-zinc-900">
            回调 body 包含：executionId / workflowId / status / event / error / trigger / steps / finishedAt
          </div>
        ) : null}
      </div>

      {tenantId && event ? (
        <CopyBox
          title="调用示例（curl）— MES 事件上报"
          text={`curl -X POST '${base}/api/hooks/${tenantId}/events/${event}' \\\\\n  -H 'Content-Type: application/json' \\\\\n  -d '{"orderId":"SO-2026-001","qty":500}'`}
        />
      ) : null}

      <div className="text-xs leading-relaxed text-zinc-400">
        MES 事件触发器用于产线系统联动：MES 调用事件上报地址推送事件 → 平台触发所有订阅了该事件的工作流 → 执行完成后把结果 POST 到回调地址写回 MES。
        回调地址受 SSRF 防护（不允许内网/保留地址），如 MES 在内网请通过公网网关暴露。
        {secret ? (
          <div className="mt-1">
            已启用密钥校验，需携带请求头 <code className="text-emerald-600">x-webhook-secret: {secret}</code> 或查询参数{' '}
            <code className="text-emerald-600">?secret={secret}</code>。
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CopyBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
      <div className="mb-1 flex items-center justify-between text-zinc-500">
        <span className="font-semibold">{title}</span>
        <button type="button" onClick={copy} className="rounded-md bg-white px-2 py-0.5 text-[10px] text-emerald-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{text}</pre>
    </div>
  )
}
