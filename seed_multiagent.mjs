// N1-B 多 Agent 编排角色种子（幂等）
// 容器内运行: node /app/dist-api/seed_multiagent.mjs
// 创建 查询/报表/推送 三个子 Agent + Orchestrator 主 Agent，主 Agent 系统提示注入子 Agent ID
import { db } from './store.js'
import { initDb, pool } from './db.js'

async function run() {
  await initDb()
  const { rows } = await pool.query('SELECT id FROM tenants ORDER BY created_at LIMIT 1')
  if (!rows[0]) { console.error('无租户，跳过'); process.exit(1) }
  const tenantId = rows[0].id
  console.log(`[tenant] ${tenantId}`)

  const existing = await db.listAgents(tenantId)
  const find = (name) => existing.find(a => a.name === name) ?? null

  // 子 Agent 定义：查询/报表/推送
  const subs = [
    {
      key: 'query', name: '查询子Agent',
      desc: '查数据库/知识库取数', status: 'active', maxTurns: 8, timeoutMs: 60000,
      tools: ['data_access.query', 'knowledge.search'],
      prompt: `你是「查询子 Agent」。当需要取数据时调用 data_access.query 查数据源，或 knowledge.search 检索知识库。只负责取数和检索，不做汇总撰写。把原始结果返回给调用方。`,
    },
    {
      key: 'report', name: '报表子Agent',
      desc: '汇总数据生成报表/日报', status: 'active', maxTurns: 10, timeoutMs: 90000,
      tools: ['data_access.query', 'workflow.run'],
      prompt: `你是「报表子 Agent」。负责把查询到的数据汇总成结构化的日报/周报/月报或指标分析。先用 data_access.query 取数，再整理成要点清晰、分段的报告文字返回给调用方。`,
    },
    {
      key: 'push', name: '推送子Agent',
      desc: '把结果推送到群/IM/审批流', status: 'active', maxTurns: 6, timeoutMs: 60000,
      tools: ['workflow.run', 'http.request'],
      prompt: `你是「推送子 Agent」。负责把指定内容通过 workflow.run 或 http.request 推送到企微/飞书/钉钉群、通知或审批流。将推送结果（成功/失败）返回给调用方。`,
    },
  ]

  const ids = {}
  for (const s of subs) {
    const found = find(s.name)
    if (found) {
      if (found.status !== 'active' || JSON.stringify(found.tools) !== JSON.stringify(s.tools)) {
        await db.updateAgent(tenantId, found.id, { status: 'active', tools: s.tools, systemPrompt: s.prompt })
        console.log(`  ↻ 更新子Agent: ${s.name} (${found.id})`)
      } else {
        console.log(`  ✓ 已存在: ${s.name} (${found.id})`)
      }
      ids[s.key] = found.id
    } else {
      const a = await db.createAgent(tenantId, {
        name: s.name, description: s.desc, systemPrompt: s.prompt, status: s.status,
        tools: s.tools, maxTurns: s.maxTurns, timeoutMs: s.timeoutMs,
      })
      ids[s.key] = a.id
      console.log(`  + 创建子Agent: ${s.name} (${a.id})`)
    }
  }

  // Orchestrator 主 Agent
  const orchName = '运营主控 (Orchestrator)'
  const orchPrompt = [
    '你是一个「运营主控」Agent，负责把用户的复杂需求拆解，并分派给专门的子 Agent 协作完成。',
    '你有以下可调用的子 Agent（用 agent.invoke 分派，agentId 见下）：',
    `- 查询 Agent（id=${ids.query}）：查数据库、检索知识库取数。`,
    `- 报表 Agent（id=${ids.report}）：把数据汇总成日报/周报/指标分析报告。`,
    `- 推送 Agent（id=${ids.push}）：把结果推送到企微/飞书/钉钉群、通知或审批流。`,
    '',
    '协作规则：',
    '1. 先分析用户需求，拆成相互独立的子任务。',
    '2. 多个独立子任务必须在同一轮用多个 agent.invoke 并行派发（不要一个个串行等）。',
    '3. 拿到各子 Agent 的结果后，把它们的回复聚合整理成一段完整、有逻辑、易读的最终答复返回给用户。',
    '4. 若某子 Agent 失败，直接说明失败原因，不中断整件事。',
    '5. 不要调用不在上述列表里的 Agent。',
  ].join('\n')

  const orchFound = find(orchName)
  if (orchFound) {
    await db.updateAgent(tenantId, orchFound.id, { status: 'active', tools: ['agent.invoke'], systemPrompt: orchPrompt, maxTurns: 14, timeoutMs: 120000 })
    console.log(`  ↻ 更新主Agent: ${orchName} (${orchFound.id})`)
  } else {
    const a = await db.createAgent(tenantId, {
      name: orchName, description: '拆解需求并分派子 Agent 协作的编排主入口',
      systemPrompt: orchPrompt, status: 'active', tools: ['agent.invoke'],
      maxTurns: 14, timeoutMs: 120000,
    })
    console.log(`  + 创建主Agent: ${orchName} (${a.id})`)
  }

  console.log('\n===== 多 Agent 角色就绪 =====')
  console.log(`查询子Agent: ${ids.query}`)
  console.log(`报表子Agent: ${ids.report}`)
  console.log(`推送子Agent: ${ids.push}`)
  console.log(`主Agent: ${orchName}`)
  process.exit(0)
}

run().catch(e => { console.error('FATAL', e); process.exit(1) })