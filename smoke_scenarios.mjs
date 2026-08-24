const BASE = 'http://localhost:5000/api'
const email = 'admin@example.com', password = 'admin123'

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    method: opts.method ?? 'GET',
  })
  return { status: r.status, json: await r.json() }
}

const login = await j('/auth/login', { method: 'POST', body: { email, password } })
const token = login.json?.data?.token
if (!token) { console.log('❌ 登录失败', JSON.stringify(login.json)); process.exit(1) }
console.log('✅ 登录成功')

const ind = await j('/scenarios/industries', { token })
console.log('\n=== 行业分布 ===')
for (const it of ind.json.data) console.log(`  ${it.industry}: ${it.count}`)

const list = await j('/scenarios', { token })
const tpls = list.json.data.templates
console.log(`\n=== 模板列表：${tpls.length} 条 ===`)
for (const t of tpls) console.log(`  [${t.imported ? '已导入' : '未导入'}] ${t.industry}｜${t.name}`)

// 找一个未导入的工厂模板导入
const target = tpls.find((t) => !t.imported) || tpls.find((t) => t.industry.includes('工厂'))
if (!target) { console.log('无模板可导入'); process.exit(0) }
console.log(`\n=== 导入：${target.name} (${target.id}) ===`)
const imp1 = await j(`/scenarios/${target.id}/import`, { token, method: 'POST' })
console.log('首次导入:', imp1.status, JSON.stringify(imp1.json.data))
if (imp1.json.data.agentId) console.log('  🆕 Agent:', imp1.json.data.agentId)
if (imp1.json.data.workflowId) console.log('  🆕 工作流:', imp1.json.data.workflowId)

const imp2 = await j(`/scenarios/${target.id}/import`, { token, method: 'POST' })
console.log('再次导入(应 alreadyImported):', JSON.stringify(imp2.json.data))

const list2 = await j('/scenarios', { token })
const t2 = list2.json.data.templates.find((t) => t.id === target.id)
console.log('\n复验 imported 标记:', t2.imported, '| importedScenarioId:', t2.importedScenarioId)
process.exit(0)