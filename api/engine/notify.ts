// engine/notify.ts
// N5 告警推送：
//   - inbox   站内通知（直接落 alerts 表，status=unread，channel=inbox）
//   - webhook HTTP 回调（POST 到订阅 URL；非 2xx 视为失败，记录 delivery_error）
//
// 注意：
//   - 不直接连企微/飞书/钉钉原生 API（签名/限流/平台差异过大）。
//     用户可在订阅处填入企微/钉钉等 incoming webhook URL，本模块对 URL 完全无感。
//   - 推送失败不抛错，只写 delivery_error 并允许下一轮重试。
//   - notifyExecutionFailure 是 fire-and-forget，调用方应用 .catch 兜底。

import { pool } from '../db.js'

type Severity = 'error' | 'warning'

interface ExecutionFailureCtx {
  executionId: string
  workflowId?: string | null
  tenantId: string
  triggeredByUserId?: string | null
  title: string
  message: string
  errorMessage?: string | null
  severity?: Severity
}

interface DeliveryResult {
  delivered: number
  failed: number
}

async function loadSubscriptions(
  tenantId: string,
  workflowId: string | null | undefined,
): Promise<Array<{
  id: string
  user_id: string | null
  channel: string
  webhook_url: string | null
  webhook_secret: string | null
}>> {
  // 匹配策略：精确匹配 workflow_id，或 workflow_id IS NULL（即"全部工作流"）
  const { rows } = await pool.query(
    `SELECT id, user_id, channel, webhook_url, webhook_secret
       FROM alert_subscriptions
      WHERE tenant_id = $1
        AND enabled = true
        AND (workflow_id = $2 OR workflow_id IS NULL)`,
    [tenantId, workflowId ?? null],
  )
  return rows
}

async function insertAlert(row: {
  tenantId: string
  subscriptionId: string | null
  executionId: string | null
  workflowId: string | null
  userId: string | null
  severity: Severity
  title: string
  message: string
  payload: unknown
  channel: string
  delivered: boolean
  deliveryError: string | null
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO alerts (
       tenant_id, subscription_id, execution_id, workflow_id, user_id,
       severity, title, message, payload, status, channel,
       delivered_at, delivery_error
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      row.tenantId,
      row.subscriptionId,
      row.executionId,
      row.workflowId,
      row.userId,
      row.severity,
      row.title,
      row.message,
      row.payload,
      row.delivered ? 'unread' : 'unread',
      row.channel,
      row.delivered ? new Date() : null,
      row.deliveryError,
    ],
  )
  return rows[0].id
}

async function sendWebhook(sub: {
  webhook_url: string | null
  webhook_secret: string | null
}, body: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!sub.webhook_url) return { ok: false, error: 'webhook_url is empty' }
  try {
    const url = new URL(sub.webhook_url)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { ok: false, error: `unsupported protocol: ${url.protocol}` }
    }
  } catch {
    return { ok: false, error: 'invalid webhook_url' }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (sub.webhook_secret) headers['x-alert-secret'] = sub.webhook_secret
    const resp = await fetch(sub.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, error: `HTTP ${resp.status} ${txt.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 触发一条失败告警：遍历订阅，落库 inbox + 推送 webhook。
 * 不抛异常；任何错误只写到日志与 delivery_error 字段。
 */
export async function notifyExecutionFailure(ctx: ExecutionFailureCtx): Promise<DeliveryResult> {
  const result: DeliveryResult = { delivered: 0, failed: 0 }
  try {
    const subs = await loadSubscriptions(ctx.tenantId, ctx.workflowId ?? null)
    if (subs.length === 0) {
      // 没有订阅也要留个系统级 audit 记录，方便排查"为啥没收到"
      await insertAlert({
        tenantId: ctx.tenantId,
        subscriptionId: null,
        executionId: ctx.executionId,
        workflowId: ctx.workflowId ?? null,
        userId: ctx.triggeredByUserId ?? null,
        severity: ctx.severity ?? 'error',
        title: ctx.title,
        message: ctx.message,
        payload: { error: ctx.errorMessage ?? null },
        channel: 'inbox',
        delivered: true,
        deliveryError: null,
      })
      return result
    }

    for (const sub of subs) {
      const channels = sub.channel.split(',').map(s => s.trim()).filter(Boolean)
      for (const ch of channels) {
        if (ch === 'inbox') {
          await insertAlert({
            tenantId: ctx.tenantId,
            subscriptionId: sub.id,
            executionId: ctx.executionId,
            workflowId: ctx.workflowId ?? null,
            userId: sub.user_id ?? ctx.triggeredByUserId ?? null,
            severity: ctx.severity ?? 'error',
            title: ctx.title,
            message: ctx.message,
            payload: { error: ctx.errorMessage ?? null },
            channel: 'inbox',
            delivered: true,
            deliveryError: null,
          })
          result.delivered++
        } else if (ch === 'webhook') {
          const body = {
            type: 'workflow.execution.failed',
            tenantId: ctx.tenantId,
            executionId: ctx.executionId,
            workflowId: ctx.workflowId ?? null,
            severity: ctx.severity ?? 'error',
            title: ctx.title,
            message: ctx.message,
            error: ctx.errorMessage ?? null,
            at: new Date().toISOString(),
          }
          const r = await sendWebhook(sub, body)
          await insertAlert({
            tenantId: ctx.tenantId,
            subscriptionId: sub.id,
            executionId: ctx.executionId,
            workflowId: ctx.workflowId ?? null,
            userId: sub.user_id ?? null,
            severity: ctx.severity ?? 'error',
            title: ctx.title,
            message: ctx.message,
            payload: { error: ctx.errorMessage ?? null, webhook_url: sub.webhook_url },
            channel: 'webhook',
            delivered: r.ok,
            deliveryError: r.ok ? null : (r.error ?? 'unknown'),
          })
          if (r.ok) result.delivered++; else result.failed++
        } else {
          // 未知 channel —— 仍落库 audit
          await insertAlert({
            tenantId: ctx.tenantId,
            subscriptionId: sub.id,
            executionId: ctx.executionId,
            workflowId: ctx.workflowId ?? null,
            userId: sub.user_id ?? null,
            severity: ctx.severity ?? 'error',
            title: ctx.title,
            message: ctx.message,
            payload: { error: ctx.errorMessage ?? null },
            channel: ch,
            delivered: false,
            deliveryError: `unknown channel: ${ch}`,
          })
          result.failed++
        }
      }
    }
  } catch (e) {
    // 模块级兜底：不应阻断主流程
    console.error('[notify] notifyExecutionFailure failed:', e)
  }
  return result
}

/** 供 routes/alerts.ts 调用的"静默重发" —— 跳过新落库，沿用原 alert 行 */
export async function redeliverWebhookAlert(alertId: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await pool.query<{
    webhook_url: string | null
    webhook_secret: string | null
    payload: unknown
    title: string
    message: string
  }>(
    `SELECT s.webhook_url, s.webhook_secret,
            a.payload, a.title, a.message
       FROM alerts a
       LEFT JOIN alert_subscriptions s ON s.id = a.subscription_id
      WHERE a.id = $1 AND a.channel = 'webhook'
      LIMIT 1`,
    [alertId],
  )
  if (rows.length === 0) return { ok: false, error: 'alert not found or not webhook' }
  const sub = { webhook_url: rows[0].webhook_url, webhook_secret: rows[0].webhook_secret }
  const body = {
    type: 'workflow.execution.failed',
    alertId,
    title: rows[0].title,
    message: rows[0].message,
    payload: rows[0].payload,
    at: new Date().toISOString(),
  }
  const r = await sendWebhook(sub, body)
  await pool.query(
    `UPDATE alerts
        SET delivered_at = $2, delivery_error = $3, updated_at = now()
      WHERE id = $1`,
    [alertId, r.ok ? new Date() : null, r.ok ? null : (r.error ?? 'unknown')],
  )
  return r
}