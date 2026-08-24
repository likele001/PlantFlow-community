// api/routes/agents.ts
// N1-A Agent 管理 + 调试 API

import { Router, type Response } from 'express'
import { db, type Agent } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { runAgent } from '../engine/agent/runner.js'

const r = Router()

function ok(res: Response, data: unknown) {
  res.json({ success: true, data })
}
function bad(res: Response, error: string, code = 400) {
  res.status(code).json({ success: false, error })
}

// ===== Agent CRUD =====

r.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const list = await db.listAgents(req.auth!.tenantId)
    ok(res, list)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const agent = await db.findAgent(req.auth!.tenantId, req.params.id)
    if (!agent) return bad(res, 'Agent 不存在', 404)
    ok(res, agent)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.post('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {}
    const { name, description, systemPrompt, modelProviderId, tools, allowedSources, maxTurns, timeoutMs, status } = body
    if (!name?.trim()) return bad(res, 'name 为必填')

    const agent = await db.createAgent(req.auth!.tenantId, {
      name: name.trim(),
      description: description ?? '',
      systemPrompt: systemPrompt ?? '',
      modelProviderId: modelProviderId ?? null,
      tools: Array.isArray(tools) ? tools : [],
      allowedSources: Array.isArray(allowedSources) ? allowedSources : [],
      maxTurns: maxTurns ?? 10,
      timeoutMs: timeoutMs ?? 60000,
      status: (status as Agent['status']) ?? 'draft',
    })
    ok(res, agent)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const patch = req.body ?? {}
    const agent = await db.updateAgent(req.auth!.tenantId, req.params.id, patch)
    if (!agent) return bad(res, 'Agent 不存在', 404)
    ok(res, agent)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

r.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const deleted = await db.deleteAgent(req.auth!.tenantId, req.params.id)
    if (!deleted) return bad(res, 'Agent 不存在', 404)
    ok(res, { deleted: true })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

// ===== Agent 执行 / 调试 =====

r.post('/:id/run', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { message, sessionId } = req.body ?? {}
    if (!message || typeof message !== 'string') {
      return bad(res, 'message 为必填字符串')
    }
    const result = await runAgent({
      tenantId: req.auth!.tenantId,
      agentId: req.params.id,
      sessionId: sessionId as string | undefined,
      userMessage: message,
      channel: 'api',
      externalId: req.auth!.userId,
    })
    ok(res, result)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Run failed')
  }
})

// ===== 会话 =====

r.get('/:id/sessions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    // 从 store 导入 pool
    const { pool } = await import('../db.js')
    const { rows } = await pool.query(
      `SELECT id, agent_id AS "agentId", summary, channel, external_id AS "externalId",
              updated_at AS "updatedAt"
       FROM agent_sessions
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY updated_at DESC
       LIMIT 20`,
      [req.auth!.tenantId, req.params.id],
    )
    ok(res, rows)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

export default r
