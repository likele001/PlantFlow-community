// routes/alerts.ts
// N5 告警中心 API：
//   GET    /api/alerts/subscriptions          列出当前租户所有订阅
//   POST   /api/alerts/subscriptions          创建订阅（channel=inbox|webhook，叠加用逗号）
//   PUT    /api/alerts/subscriptions/:id      修改（channel/url/secret/enabled/workflow_id）
//   DELETE /api/alerts/subscriptions/:id      删除
//   GET    /api/alerts                       列出站内通知（按 user 过滤，status 可选）
//   POST   /api/alerts/:id/ack               标记已读/已处理（read | resolved）
//   POST   /api/alerts/:id/redeliver         仅 webhook 类：重新推送
//   GET    /api/alerts/unread-count          未读数量（用于前端角标）

import { Router, type Response } from 'express'
import { pool } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'
import { redeliverWebhookAlert } from '../engine/notify.js'

const router = Router()

function uuid(s: unknown): string | null {
  if (typeof s !== 'string') return null
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null
}

router.get('/subscriptions', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { rows } = await pool.query(
    `SELECT id, tenant_id, workflow_id, user_id, channel, webhook_url, webhook_secret,
            enabled, created_at, updated_at
       FROM alert_subscriptions
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId],
  )
  res.json({ success: true, data: rows })
})

router.post('/subscriptions', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const userId = req.auth!.userId
  const { workflow_id, channel, webhook_url, webhook_secret, enabled } = req.body ?? {}

  if (typeof channel !== 'string' || !channel.trim()) {
    res.status(400).json({ success: false, error: 'channel 必填（inbox|webhook）' })
    return
  }
  const channels = channel.split(',').map((s: string) => s.trim()).filter(Boolean)
  if (!channels.every((c: string) => c === 'inbox' || c === 'webhook')) {
    res.status(400).json({ success: false, error: 'channel 仅支持 inbox / webhook，叠加用逗号' })
    return
  }
  if (channels.includes('webhook') && (typeof webhook_url !== 'string' || !webhook_url.trim())) {
    res.status(400).json({ success: false, error: 'channel=webhook 时 webhook_url 必填' })
    return
  }
  let wfId: string | null = null
  if (workflow_id !== undefined && workflow_id !== null && workflow_id !== '') {
    const u = uuid(workflow_id)
    if (!u) {
      res.status(400).json({ success: false, error: 'workflow_id 必须是 UUID 或留空' })
      return
    }
    wfId = u
  }
  const secret = typeof webhook_secret === 'string' && webhook_secret.trim() ? webhook_secret : null
  const en = enabled === undefined ? true : !!enabled

  const { rows } = await pool.query(
    `INSERT INTO alert_subscriptions
       (tenant_id, workflow_id, user_id, channel, webhook_url, webhook_secret, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, tenant_id, workflow_id, user_id, channel, webhook_url, webhook_secret,
               enabled, created_at, updated_at`,
    [tenantId, wfId, userId, channel.trim(), webhook_url ?? null, secret, en],
  )
  res.json({ success: true, data: rows[0] })
})

router.put('/subscriptions/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const id = uuid(req.params.id)
  if (!id) {
    res.status(400).json({ success: false, error: '订阅 id 非法' })
    return
  }
  const { workflow_id, channel, webhook_url, webhook_secret, enabled } = req.body ?? {}
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (workflow_id !== undefined) {
    const u = uuid(workflow_id)
    if (workflow_id !== null && workflow_id !== '' && !u) {
      res.status(400).json({ success: false, error: 'workflow_id 必须是 UUID 或留空' })
      return
    }
    fields.push(`workflow_id = $${idx++}`)
    values.push(u)
  }
  if (channel !== undefined) {
    if (typeof channel !== 'string' || !channel.trim()) {
      res.status(400).json({ success: false, error: 'channel 必填' })
      return
    }
    const channels = channel.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (!channels.every((c: string) => c === 'inbox' || c === 'webhook')) {
      res.status(400).json({ success: false, error: 'channel 仅支持 inbox / webhook' })
      return
    }
    fields.push(`channel = $${idx++}`)
    values.push(channel.trim())
  }
  if (webhook_url !== undefined) {
    fields.push(`webhook_url = $${idx++}`)
    values.push(webhook_url ?? null)
  }
  if (webhook_secret !== undefined) {
    fields.push(`webhook_secret = $${idx++}`)
    values.push(webhook_secret ?? null)
  }
  if (enabled !== undefined) {
    fields.push(`enabled = $${idx++}`)
    values.push(!!enabled)
  }
  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '没有可更新字段' })
    return
  }
  fields.push(`updated_at = now()`)
  values.push(id)
  values.push(tenantId)

  const { rows } = await pool.query(
    `UPDATE alert_subscriptions
        SET ${fields.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING id, tenant_id, workflow_id, user_id, channel, webhook_url, webhook_secret,
                enabled, created_at, updated_at`,
    values,
  )
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: '订阅不存在' })
    return
  }
  res.json({ success: true, data: rows[0] })
})

router.delete('/subscriptions/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const id = uuid(req.params.id)
  if (!id) {
    res.status(400).json({ success: false, error: '订阅 id 非法' })
    return
  }
  const r = await pool.query(
    `DELETE FROM alert_subscriptions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (r.rowCount === 0) {
    res.status(404).json({ success: false, error: '订阅不存在' })
    return
  }
  res.json({ success: true })
})

router.get('/unread-count', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const userId = req.auth!.userId
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM alerts
      WHERE tenant_id = $1
        AND channel = 'inbox'
        AND status = 'unread'
        AND (user_id = $2 OR user_id IS NULL)`,
    [tenantId, userId],
  )
  res.json({ success: true, data: { unread: parseInt(rows[0].cnt, 10) } })
})

router.get('/', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const userId = req.auth!.userId
  const status = typeof req.query.status === 'string' ? req.query.status : null
  const channel = typeof req.query.channel === 'string' ? req.query.channel : 'inbox'
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)))

  const conditions = ['tenant_id = $1', 'channel = $2', '(user_id = $3 OR user_id IS NULL)']
  const values: unknown[] = [tenantId, channel, userId]
  if (status) {
    conditions.push(`status = $${values.length + 1}`)
    values.push(status)
  }
  values.push(limit)
  const { rows } = await pool.query(
    `SELECT id, tenant_id, subscription_id, execution_id, workflow_id, user_id,
            severity, title, message, payload, status, channel,
            delivered_at, delivery_error, created_at, updated_at
       FROM alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${values.length}`,
    values,
  )
  res.json({ success: true, data: rows })
})

router.post('/:id/ack', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const userId = req.auth!.userId
  const id = uuid(req.params.id)
  if (!id) {
    res.status(400).json({ success: false, error: 'alert id 非法' })
    return
  }
  const target = typeof req.body?.status === 'string' ? req.body.status : 'read'
  if (!['read', 'resolved', 'unread'].includes(target)) {
    res.status(400).json({ success: false, error: 'status 仅支持 read|resolved|unread' })
    return
  }
  const { rows } = await pool.query(
    `UPDATE alerts SET status = $3, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
        AND channel = 'inbox'
        AND (user_id = $4 OR user_id IS NULL)
      RETURNING id, status`,
    [id, tenantId, target, userId],
  )
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: '通知不存在或无权限' })
    return
  }
  res.json({ success: true, data: rows[0] })
})

router.post('/:id/redeliver', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const id = uuid(req.params.id)
  if (!id) {
    res.status(400).json({ success: false, error: 'alert id 非法' })
    return
  }
  // 校验归属
  const own = await pool.query(
    `SELECT 1 FROM alerts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (own.rowCount === 0) {
    res.status(404).json({ success: false, error: 'alert 不存在' })
    return
  }
  const r = await redeliverWebhookAlert(id)
  if (!r.ok) {
    res.status(502).json({ success: false, error: r.error ?? 'redeliver failed' })
    return
  }
  res.json({ success: true })
})

export default router