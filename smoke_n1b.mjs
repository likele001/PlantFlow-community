// N1-B 多 Agent 编排引擎冒烟测试（确定性，无需 LLM）
// 容器内运行: node /app/dist-api/smoke_n1b.mjs
import { getTool, listAgentTools, MAX_AGENT_DEPTH } from './engine/agent/tools.js'

let pass = 0, fail = 0
function assert(name, cond, detail = '') {
  if (cond) pass++; else fail++
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`)
}

console.log('=== 默认常量 ===')
assert('MAX_AGENT_DEPTH 默认=5', MAX_AGENT_DEPTH === 5, String(MAX_AGENT_DEPTH))

console.log('\n=== Test 1: agent.invoke 工具注册 ===')
const t = getTool('agent.invoke')
assert('已注册', !!t)
assert('schema 含 agentId', t?.schema?.properties?.agentId?.type === 'string', JSON.stringify(t?.schema?.properties?.agentId))
assert('schema 含 task', t?.schema?.properties?.task?.type === 'string')
assert('必需参数 [agentId, task]', JSON.stringify(t?.schema?.required) === JSON.stringify(['agentId', 'task']))
assert('描述包含"并行"', t?.description?.includes('并行') === true)
assert('toolsToOpenAi 可见', listAgentTools({ tools: ['agent.invoke'] }).some(x => x.name === 'agent.invoke'))

console.log('\n=== Test 2: 安全守卫（无需 LLM）===')
const mkCtx = (over = {}) => ({
  tenantId: 't1',
  agent: { id: 'orchestrator', tools: [] },
  args: { agentId: 'sub', task: 'do x' },
  depth: 0,
  ...over,
})
// 缺 agentId
let r = await t.invoke(mkCtx({ args: { task: 'x' } })).then(() => 'OK').catch(e => e.message)
assert('缺 agentId 被拦截', r !== 'OK' && /agentId/.test(r ?? ''), r)
// 缺 task
r = await t.invoke(mkCtx({ args: { agentId: 'sub' } })).then(() => 'OK').catch(e => e.message)
assert('缺 task 被拦截', r !== 'OK' && /任务/.test(r ?? ''), r)
// 禁止调用自身
r = await t.invoke(mkCtx({ agent: { id: 'self', tools: [] }, args: { agentId: 'self', task: 'x' } })).then(() => 'OK').catch(e => e.message)
assert('禁止调用自身', r !== 'OK' && /自身/.test(r ?? ''), r)
// 嵌套深度达标拦截
r = await t.invoke(mkCtx({ depth: MAX_AGENT_DEPTH })).then(() => 'OK').catch(e => e.message)
assert('深度上限被拦截', r !== 'OK' && /嵌套过深/.test(r ?? ''), r)
// 未达到上限时放行到 runAgent（应报 Agent 不存在而非守卫错误）
r = await t.invoke(mkCtx({ depth: MAX_AGENT_DEPTH - 1 })).then(() => 'OK').catch(e => e.message)
assert('未超深度时放行到执行器', r !== 'OK' && !/嵌套过深/.test(r ?? ''), r ?? 'NO-ERR')

console.log('\n=== Test 3: runner 可加载 && 接收 depth ===')
try {
  const runner = await import('./engine/agent/runner.js')
  assert('runner 模块可加载', typeof runner.runAgent === 'function')
  assert('runAgent 支持 depth 参数', runner.runAgent.length >= 1)
} catch (e) {
  assert('runner 模块可加载', false, e?.message || String(e))
}

console.log('\n========== 汇总 ==========')
console.log(`通过: ${pass} / ${pass + fail}`)
console.log(`失败: ${fail}`)
if (fail > 0) process.exit(1)
console.log('N1-B 引擎冒烟测试通过')
process.exit(0)