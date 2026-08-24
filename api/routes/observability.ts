import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

// 允许的 kind 白名单，防止 SQL 注入到 kind= 过滤
const KINDS = new Set(['chat', 'embedding', 'tool', 'stream'])

/** LLM 用量汇总 + 明细 */
router.get('/llm-usage/summary', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const from = String(req.query.from ?? '').trim() || undefined
  const to = String(req.query.to ?? '').trim() || undefined
  const kind = String(req.query.kind ?? '').trim() || undefined
  try {
    const agg = await db.aggregateLlmUsage(tenantId, { from, to, kind: KINDS.has(kind ?? '') ? kind : undefined })
    res.json({ success: true, data: agg })
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '统计失败' })
  }
})

router.get('/llm-usage', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const kind = String(req.query.kind ?? '').trim() || undefined
  const executionId = String(req.query.executionId ?? '').trim() || undefined
  const list = await db.listLlmUsage(tenantId, {
    limit: Number(req.query.limit ?? 100),
    kind: KINDS.has(kind ?? '') ? kind : undefined,
    executionId,
  })
  res.json({ success: true, data: list })
})

/** Agent 调用链：按会话 / Agent / 执行 检索 */
router.get('/agent-traces', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const sessionId = String(req.query.sessionId ?? '').trim() || undefined
  const agentId = String(req.query.agentId ?? '').trim() || undefined
  const executionId = String(req.query.executionId ?? '').trim() || undefined
  const traces = await db.listAgentCallTraces(tenantId, {
    limit: Number(req.query.limit ?? 200),
    sessionId,
    agentId,
    executionId,
  })
  res.json({ success: true, data: traces })
})

export default router