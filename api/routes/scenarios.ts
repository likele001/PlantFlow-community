// api/routes/scenarios.ts
// N2: 分行业场景模板市场
import { Router, type Response } from 'express'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const r = Router()

function ok(res: Response, data: unknown) {
  res.json({ success: true, data })
}
function bad(res: Response, error: string, code = 400) {
  res.status(code).json({ success: false, error })
}

// 模板列表：内置模板 + 本租户已导入的模板（带 imported 标记、industry 筛选）
r.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.auth!.tenantId
    const industry = (req.query.industry as string | undefined)?.trim() ?? null

    let base = `SELECT s.id, s.industry, s.name, s.description, s.icon, s.steps,
                       s.is_builtin AS "isBuiltin", s.workflow_id AS "workflowId", s.created_at AS "createdAt"
                FROM bot_scenarios s WHERE s.is_builtin = true`
    const conds: string[] = []
    const params: unknown[] = []
    if (industry) {
      params.push(industry)
      conds.push(`s.industry = $${params.length}`)
    }
    if (conds.length) base += ' AND ' + conds.join(' AND ')
    base += ' ORDER BY s.industry, s.created_at'
    const builtins = (await pool.query(base, params)).rows

    // 本租户已导入场景：判断哪些模板已导入 + 租户侧的 agent/workflow id
    const imported = (await pool.query(
      `SELECT s.id AS "scenarioId", s.name,
              s.template_payload->>'source' AS source,
              s.workflow_id AS "workflowId"
       FROM bot_scenarios s
       WHERE s.tenant_id = $1 AND s.is_builtin = false`,
      [tenantId],
    )).rows

    const importedBySource = new Map<string, { scenarioId: string; workflowId: string | null }>()
    const tenantScenarios = new Map<string, { name: string; workflowId: string | null }>()
    for (const im of imported) {
      if (im.source) importedBySource.set(im.source, { scenarioId: im.scenarioId, workflowId: im.workflowId })
      tenantScenarios.set(im.name, { name: im.name, workflowId: im.workflowId })
    }

    // 租户自定义（非从模板导入）的场景也返回，便于统一管理
    const custom = (await pool.query(
      `SELECT s.id, s.industry, s.name, s.description, s.icon, s.steps,
              s.is_builtin AS "isBuiltin", s.workflow_id AS "workflowId", s.created_at AS "createdAt"
       FROM bot_scenarios s
       WHERE s.tenant_id = $1 AND (s.template_payload IS NULL OR s.template_payload->>'source' IS NULL)
       ORDER BY s.created_at DESC`,
      [tenantId],
    )).rows

    const builtinRows = builtins.map((b) => {
      const im = importedBySource.get(b.id)
      return { ...b, imported: !!im, importedScenarioId: im?.scenarioId ?? null }
    })

    ok(res, { templates: builtinRows, custom })
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

// 行业分布（供前端筛选标签 + 计数）
r.get('/industries', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rows = (await pool.query(
      `SELECT industry, count(*)::int AS count FROM bot_scenarios
       WHERE is_builtin = true GROUP BY industry ORDER BY industry`,
    )).rows
    ok(res, rows)
  } catch (e) {
    bad(res, e instanceof Error ? e.message : 'Unknown error')
  }
})

// 一键导入：根据模板生成 Agent / 工作流，并创建本租户场景（幂等）
r.post('/:id/import', requireAuth, async (req: AuthedRequest, res) => {
  const client = await pool.connect()
  try {
    const tenantId = req.auth!.tenantId
    const tplId = req.params.id

    const tplRes = await client.query(
      `SELECT * FROM bot_scenarios WHERE id = $1 AND is_builtin = true AND tenant_id IS NULL`,
      [tplId],
    )
    if (tplRes.rowCount === 0) return bad(res, '模板不存在', 404)
    const tpl = tplRes.rows[0]
    const payload = tpl.template_payload ?? {}

    // 幂等：已导入过则直接返回
    const dupRes = await client.query(
      `SELECT id, workflow_id AS "workflowId" FROM bot_scenarios
       WHERE tenant_id = $1 AND template_payload->>'source' = $2`,
      [tenantId, tplId],
    )
    if ((dupRes.rowCount ?? 0) > 0) {
      const d = dupRes.rows[0]
      return ok(res, { alreadyImported: true, scenarioId: d.id, workflowId: d.workflowId, name: tpl.name })
    }

    await client.query('BEGIN')

    let agentId: string | null = null
    let workflowId: string | null = null

    // 生成 Agent
    if (payload.agent) {
      const a = payload.agent
      let name = a.name || `${tpl.name}助手`
      // agents 表对 (tenant_id, name) 唯一，重名则加序号
      const nameExists = await client.query(
        `SELECT 1 FROM agents WHERE tenant_id = $1 AND name = $2`, [tenantId, name],
      )
      if ((nameExists.rowCount ?? 0) > 0) {
        name = `${name} (${Date.now().toString().slice(-4)})`
      }
      const agentRes = await client.query(
        `INSERT INTO agents (tenant_id, name, description, system_prompt,
                             tools, allowed_sources, max_turns, timeout_ms, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')
         RETURNING id`,
        [tenantId, name, a.description ?? tpl.description, a.system_prompt ?? '',
         JSON.stringify(a.tools ?? []), JSON.stringify(a.allowedSources ?? []),
         a.maxTurns ?? 10, a.timeoutMs ?? 120000],
      )
      agentId = agentRes.rows[0].id
    }

    // 生成工作流
    if (payload.workflow) {
      const w = payload.workflow
      const wfRes = await client.query(
        `INSERT INTO workflows (tenant_id, name, status, definition)
         VALUES ($1,$2,'draft',$3) RETURNING id`,
        [tenantId, w.name || tpl.name, JSON.stringify(w.definition ?? { nodes: [], edges: [] })],
      )
      workflowId = wfRes.rows[0].id
    }

    // 记录本租户场景（引导字段并存 + 保留来源模板引用以便幂等）
    const scenRes = await client.query(
      `INSERT INTO bot_scenarios (tenant_id, industry, name, description, icon, steps,
                                  template_payload, workflow_id, is_builtin, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,true)
       RETURNING id`,
      [tenantId, tpl.industry, tpl.name, tpl.description, tpl.icon,
       JSON.stringify(tpl.steps ?? []),
       JSON.stringify({ source: tplId, agentId, workflowId }),
       workflowId],
    )
    const scenarioId = scenRes.rows[0].id

    await client.query('COMMIT')
    ok(res, { alreadyImported: false, scenarioId, agentId, workflowId, name: tpl.name, industry: tpl.industry })
  } catch (e) {
    await client.query('ROLLBACK')
    bad(res, e instanceof Error ? e.message : 'Import failed')
  } finally {
    client.release()
  }
})

export default r