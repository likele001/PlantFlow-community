import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const list = await db.listExecutions(tenantId, { workflowId, status, createdBy: (req.auth!.role === 'operator' || req.auth!.role === 'agent') ? req.auth!.userId : undefined })
  res.json({ success: true, data: list })
})

router.get('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const item = await db.findExecution(tenantId, req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const steps = await db.listExecutionSteps(item.id)
  // N6: 子执行列表（本执行作为父级调用的子工作流运行）
  let children: unknown[] = []
  if (item.id) {
    try {
      children = await db.listChildExecutions(req.auth!.tenantId, item.id)
    } catch { children = [] }
  }
  res.json({ success: true, data: { ...item, steps, children } })
})

router.get('/jobs/:jobId', async (req: AuthedRequest, res: Response): Promise<void> => {
  const job = await db.findExecutionJob(req.auth!.tenantId, req.params.jobId)
  if (!job) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: job })
})


// O2: 执行回放 —— 展开父子调用链,按时间线返回完整步骤
router.get('/:id/replay', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const root = await db.findExecution(tenantId, req.params.id)
  if (!root) {
    res.status(404).json({ success: false, error: '执行不存在' })
    return
  }
  async function expand(execId: string, depth: number): Promise<unknown> {
    const exec = await db.findExecution(tenantId, execId)
    if (!exec) return null
    const steps = await db.listExecutionSteps(exec.id)
    const children = await db.listChildExecutions(tenantId, exec.id)
    return {
      execution: exec,
      steps,
      children: depth > 0 ? await Promise.all(children.map((c) => expand(c.id, depth - 1))) : [],
    }
  }
  const tree = await expand(root.id, 3) // 最多递归 3 层防止爆栈
  res.json({ success: true, data: tree })
})

router.post('/:id/cancel', async (req: AuthedRequest, res: Response): Promise<void> => {
  const ok = await db.cancelExecution(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(400).json({ success: false, error: '无法取消（可能已结束）' })
    return
  }
  res.json({ success: true })
})

router.post('/:id/retry', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const item = await db.findExecution(tenantId, req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const triggerData =
    item.triggerData && typeof item.triggerData === 'object'
      ? (item.triggerData as Record<string, unknown>)
      : {}
  const job = await db.enqueueExecutionJob({
    tenantId,
    workflowId: item.workflowId,
    triggerType: item.triggerType,
    triggerData,
    userId: req.auth!.userId,
  })
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'execution.retry',
    resourceType: 'execution',
    resourceId: item.id,
    detail: { jobId: job.id },
  })
  res.json({ success: true, data: { jobId: job.id } })
})

export default router
