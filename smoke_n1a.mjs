// N1-A Agent 地基冒烟测试 (纯 JS)
import { db } from './dist-api/store.js'
import { initDb } from './dist-api/db.js'
import { listAgentTools, toolsToOpenAiFormat, getTool } from './dist-api/engine/agent/tools.js'
import crypto from 'crypto'

function randId() { return crypto.randomUUID() }

async function run() {
  await initDb()
  console.log('[db] connected')

  const { rows: tenants } = await (await import('./dist-api/db.js')).pool.query('SELECT id FROM tenants LIMIT 1')
  const tenantId = tenants[0].id
  console.log(`[tenant] ${tenantId}`)

  let pass = 0, fail = 0
  const createdAgentIds = []

  function assert(name, cond, detail) {
    if (cond) { pass++ } else { fail++ }
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' - '+detail : ''}`)
  }

  // Test 1: Agent CRUD
  console.log('\n--- Test 1: Agent CRUD ---')
  try {
    const agent = await db.createAgent(tenantId, {
      name: 'smoke-test-agent',
      description: '冒烟测试 Agent',
      systemPrompt: '你是一个测试助手。',
      tools: ['data_access.query', 'knowledge.search'],
      allowedSources: [],
      maxTurns: 5,
      timeoutMs: 30000,
      status: 'active',
    })
    createdAgentIds.push(agent.id)
    assert('createAgent OK', !!agent.id, agent.id)
    assert('name 正确', agent.name === 'smoke-test-agent')
    assert('tools 正确', Array.isArray(agent.tools) && agent.tools.length === 2, String(agent.tools))
    assert('status=active', agent.status === 'active')
    assert('maxTurns=5', agent.maxTurns === 5, String(agent.maxTurns))

    const found = await db.findAgent(tenantId, agent.id)
    assert('findAgent OK', !!found && found.id === agent.id)

    const updated = await db.updateAgent(tenantId, agent.id, {
      name: 'smoke-test-agent-v2',
      maxTurns: 8,
    })
    assert('updateAgent OK', updated?.name === 'smoke-test-agent-v2', updated?.name)
    assert('maxTurns 更新', updated?.maxTurns === 8, String(updated?.maxTurns))

    const list = await db.listAgents(tenantId)
    assert('listAgents 包含', list.some(a => a.id === agent.id), `count=${list.length}`)
  } catch (e) {
    assert('Agent CRUD', false, e?.message || String(e))
  }

  // Test 2: Tool Registry
  console.log('\n--- Test 2: Tool Registry ---')
  try {
    // 创建一个带工具的 agent 用于测试
    const agent2 = await db.createAgent(tenantId, {
      name: 'smoke-tools-agent',
      tools: ['data_access.query', 'knowledge.search', 'workflow.run'],
      status: 'active',
    })
    createdAgentIds.push(agent2.id)

    const tools = listAgentTools(agent2)
    assert('列出 3 个工具', tools.length >= 3, `count=${tools.length}`)

    const toolNames = tools.map(t => t.name)
    assert('包含 data_access.query', toolNames.includes('data_access.query'))
    assert('包含 knowledge.search', toolNames.includes('knowledge.search'))
    assert('包含 workflow.run', toolNames.includes('workflow.run'))

    const openAiFmt = toolsToOpenAiFormat(tools)
    assert('OpenAI 格式正确', Array.isArray(openAiFmt) && openAiFmt.length > 0, `count=${openAiFmt.length}`)
    assert('格式含 type=function', openAiFmt[0]?.type === 'function', openAiFmt[0]?.type)
    assert('格式含 function.name', !!openAiFmt[0]?.function?.name, openAiFmt[0]?.function?.name)

    const t = getTool('data_access.query')
    assert('getTool 可获取', !!t)
    assert('工具有 schema', !!t?.schema?.properties?.sourceId, 'sourceId in schema')
    assert('工具有 description', typeof t?.description === 'string' && t.description.length > 0)
  } catch (e) {
    assert('Tool Registry', false, e?.message || String(e))
  }

  // Test 3: Agent 会话
  console.log('\n--- Test 3: Agent 会话 ---')
  try {
    const agent3 = await db.createAgent(tenantId, {
      name: 'smoke-session-agent',
      status: 'active',
    })
    createdAgentIds.push(agent3.id)

    // 创建会话
    const session = await db.getOrCreateAgentSession({
      tenantId,
      agentId: agent3.id,
      channel: 'test',
      externalId: 'user-123',
    })
    assert('创建会话 OK', !!session.id, session.id)
    assert('history 为空数组', Array.isArray(session.history) && session.history.length === 0)

    // 再次 getOrCreate 应返回同一个（upsert）
    const session2 = await db.getOrCreateAgentSession({
      tenantId,
      agentId: agent3.id,
      channel: 'test',
      externalId: 'user-123',
    })
    assert('同一 channel+external 返回同一会话', session.id === session2.id, session.id)

    // 更新历史
    const history = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮您？' },
    ]
    const updated = await db.updateAgentSessionHistory(tenantId, session.id, history, '测试摘要')
    assert('更新历史 OK', !!updated && updated.history.length === 2, `len=${updated?.history.length}`)
    assert('summary 更新', updated?.summary === '测试摘要', updated?.summary)

    // 读取验证
    const got = await db.getAgentSession(tenantId, session.id)
    assert('getAgentSession 正确', got?.history.length === 2, `len=${got?.history.length}`)
  } catch (e) {
    assert('Agent 会话', false, e?.message || String(e))
  }

  // 清理
  for (const id of createdAgentIds) {
    await db.deleteAgent(tenantId, id)
  }
  await (await import('./dist-api/db.js')).pool.query(
    'DELETE FROM agent_sessions WHERE tenant_id = $1 AND channel = $2',
    [tenantId, 'test']
  )
  console.log('\n已清理 smoke 测试数据')

  console.log(`\n========== 汇总 ==========\n通过: ${pass} / ${pass+fail}\n失败: ${fail}`)
  if (fail > 0) process.exit(1)
  process.exit(0)
}

run().catch(e => { console.error('FATAL', e); process.exit(1) })
