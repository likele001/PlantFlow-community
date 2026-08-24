import { useState } from 'react'
import { Field, type NodeConfigProps } from './types'

export default function TriggerWebhookConfig({ node, tenantId, onChange, onFocusField }: NodeConfigProps) {
  const [tab, setTab] = useState<'webhook' | 'event'>(() =>
    String(node.config?.mode ?? 'webhook') === 'event' ? 'event' : 'webhook'
  )
  const path = String(node.config.path ?? '')
  const event = String(node.config.event ?? '')
  const secret = String(node.config.secret ?? '')
  const base = window.location.origin

  function switchMode(next: 'webhook' | 'event') {
    setTab(next)
    onChange('mode', next)
  }

  return (
    <div className="space-y-3">
      {/* 模式切换 */}
      <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
        {(['webhook', 'event'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              tab === m ? 'bg-violet-600 text-white shadow' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {m === 'webhook' ? 'Webhook' : '事件订阅'}
          </button>
        ))}
      </div>

      {tab === 'webhook' ? (
        <>
          <Field
            label="路径标识"
            value={path}
            placeholder="如 order-created"
            onChange={(v) => onChange('path', v)}
            onPickVar={() => onFocusField('path')}
          />
          {tenantId && path ? (
            <CopyBox title="Webhook 触发地址（POST/GET/PUT…）" text={`${base}/api/hooks/${tenantId}/${path}`} />
          ) : null}
        </>
      ) : (
        <>
          <Field
            label="事件名称"
            value={event}
            placeholder="如 order.created / production.report"
            onChange={(v) => onChange('event', v)}
            onPickVar={() => onFocusField('event')}
          />
          {tenantId && event ? (
            <CopyBox
              title="事件总线触发地址（POST）— 同一事件名会触发所有订阅工作流"
              text={`${base}/api/hooks/${tenantId}/events/${event}`}
            />
          ) : null}
        </>
      )}

      <Field
        label="调用密钥（可选）"
        value={secret}
        onChange={(v) => onChange('secret', v)}
      />

      {tab === 'webhook' && tenantId && path ? (
        <CopyBox title="调用示例（curl）" text={`curl -X POST '${base}/api/hooks/${tenantId}/${path}' \\\\\n  -H 'Content-Type: application/json' \\\\\n  -d '{"hello":"world"}'`} />
      ) : null}
      {tab === 'event' && tenantId && event ? (
        <CopyBox
          title="调用示例（curl）— MES 事件上报"
          text={`curl -X POST '${base}/api/hooks/${tenantId}/events/${event}' \\\\\n  -H 'Content-Type: application/json' \\\\\n  -d '{"orderId":"SO-2026-001","qty":500}'`}
        />
      ) : null}

      <div className="text-xs text-zinc-400 leading-relaxed">
        {tab === 'event'
          ? '事件订阅用于生态联动：多个工作流可订阅同一事件名，外部系统(MES/ERP)调用事件总线端点一次即可触发所有已发布&已订阅工作流并行执行。'
          : 'Webhook 用于三方系统回调：把地址给调用方，事件 POST 到该地址即触发本工作流。'}
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
        <button type="button" onClick={copy} className="rounded-md bg-white px-2 py-0.5 text-[10px] text-violet-600 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{text}</pre>
    </div>
  )
}

export { Field }