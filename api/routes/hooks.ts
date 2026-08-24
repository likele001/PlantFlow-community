import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { db } from '../store.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// F5: 常量时间比较，避免通过耗时差异逐字节猜解 secret
function secretMatches(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

// O5: 事件订阅总线 — 外部系统(MES)用统一事件名一次触发多个订阅工作流
// POST /api/hooks/:tenantId/events/:eventName  →  触发所有 config.mode='event' 且 config.event=<eventName> 的已发布工作流
router.all('/:tenantId/events/:eventName', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const eventName = String(req.params.eventName ?? '').trim()
  if (!tenantId || !eventName) {
    res.status(400).json({ success: false, error: 'invalid event' })
    return
  }
  if (!UUID_RE.test(tenantId)) {
    res.status(404).json({ success: false, error: 'event not found' })
    return
  }

  let subs
  try {
    subs = await db.findWorkflowsByEvent(tenantId, eventName)
  } catch (e) {
    console.error('[hooks] findWorkflowsByEvent error:', e)
    res.status(500).json({ success: false, error: 'internal error' })
    return
  }
  if (!subs.length) {
    res.status(404).json({ success: false, error: 'event not subscribed' })
    return
  }

  // 校验 secret（若任一订阅配置了 secret，则请求必须携带且匹配，否则拒绝触发）
  const withSecret = subs.filter((s) => String(s.config?.secret ?? '').trim())
  if (withSecret.length) {
    const storedSecret = String(withSecret[0].config?.secret ?? '').trim()
    const supplied = String(req.get('x-webhook-secret') ?? req.query.secret ?? '').trim()
    if (!supplied || !secretMatches(storedSecret, supplied)) {
      res.status(401).json({ success: false, error: 'invalid event secret' })
      return
    }
  }

  const triggerData = {
    type: 'event',
    mode: 'event',
    event: eventName,
    method: req.method,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    },
    body: req.body,
    content: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    receivedAt: new Date().toISOString(),
  }

  const jobs: { workflowId: any; workflowName: any; jobId: string }[] = []
  for (const sub of subs) {
    // O5: 按订阅类型分发 — trigger.mes 走 MES 触发器（可写回回调地址），trigger.webhook 走事件订阅
    const isMes = String(sub.config?.mode ?? '') === 'mes'
    const job = await db.enqueueExecutionJob({
      tenantId,
      workflowId: sub.workflowId,
      triggerType: isMes ? 'trigger.mes' : 'trigger.webhook',
      triggerData: {
        ...triggerData,
        type: isMes ? 'mes' : 'webhook',
        mode: isMes ? 'mes' : 'event',
        workflowName: sub.workflowName,
        nodeId: sub.nodeId,
      },
    })
    jobs.push({ workflowId: sub.workflowId, workflowName: sub.workflowName, jobId: job.id })
  }

  res.status(202).json({
    success: true,
    data: { event: eventName, triggered: jobs.length, jobs },
    message: '已投递给所有订阅执行',
  })
})

router.all('/:tenantId/:path', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const path = String(req.params.path ?? '').trim()
  if (!tenantId || !path) {
    res.status(400).json({ success: false, error: 'invalid hook' })
    return
  }

  // 防御：tenantId 必须是 UUID，否则 DB uuid 列查询会抛错并可能导致进程崩溃
  if (!UUID_RE.test(tenantId)) {
    res.status(404).json({ success: false, error: 'webhook not found' })
    return
  }

  let match: { workflowId: string; nodeId: string; config?: Record<string, unknown> } | null
  try {
    match = await db.findWorkflowByWebhook(tenantId, path)
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[hooks] findWorkflowByWebhook error:', e)
    }
    res.status(500).json({ success: false, error: 'internal error' })
    return
  }
  if (!match) {
    res.status(404).json({ success: false, error: 'webhook not found' })
    return
  }

  // F5: 可选 secret 校验。配置了 secret 时，必须带 x-webhook-secret 头或 ?secret= 参数匹配
  const storedSecret = String(match.config?.secret ?? '').trim()
  if (storedSecret) {
    const supplied = String(req.get('x-webhook-secret') ?? req.query.secret ?? '').trim()
    if (!supplied || !secretMatches(storedSecret, supplied)) {
      res.status(401).json({ success: false, error: 'invalid webhook secret' })
      return
    }
  }

  const triggerData = {
    type: 'webhook',
    method: req.method,
    path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    },
    body: req.body,
    content: typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body ?? {}),
    receivedAt: new Date().toISOString(),
  }

  const job = await db.enqueueExecutionJob({
    tenantId,
    workflowId: match.workflowId,
    triggerType: 'trigger.webhook',
    triggerData,
  })

  res.status(202).json({
    success: true,
    data: { jobId: job.id, message: '已加入执行队列' },
  })
})

export default router