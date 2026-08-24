// F1 队列可靠性冒烟测试
// 在容器内运行：node /app/smoke_test.mjs
import { db } from './dist-api/store.js'
import { initDb, pool } from './dist-api/db.js'
import crypto from 'crypto'

function randId() { return crypto.randomUUID() }

async function run() {
  await initDb()
  console.log('[db] connected')

  // 获取一个测试用 tenant & workflow
  const { rows: tenants } = await pool.query('SELECT id FROM tenants LIMIT 1')
  if (tenants.length === 0) { console.error('no tenants'); process.exit(1) }
  const tenantId = tenants[0].id
  console.log(`[tenant] ${tenantId}`)

  const { rows: wfs } = await pool.query('SELECT id FROM workflows WHERE tenant_id = $1 LIMIT 1', [tenantId])
  const workflowId = wfs[0]?.id ?? randId()
  console.log(`[workflow] ${workflowId}`)

  let pass = 0, fail = 0
  const results = []

  function assert(name, cond, detail = '') {
    if (cond) { pass++; results.push({name, ok:true, detail}) }
    else { fail++; results.push({name, ok:false, detail}) }
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' - '+detail : ''}`)
  }

  async function getJob(id) {
    const { rows } = await pool.query('SELECT * FROM execution_jobs WHERE id = $1', [id])
    return rows[0] || null
  }

  // === Test 1: 基本入队 ===
  console.log('\n--- Test 1: 基本入队 ---')
  const job = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke',
    triggerData: { t: Date.now() },
  })
  assert('enqueue returns job', !!job?.id, `id=${job.id}`)
  assert('enqueue status is pending', job.status === 'pending', job.status)
  assert('enqueue attemptCount=0', job.attemptCount === 0, String(job.attemptCount))
  assert('enqueue maxAttempts=3', job.maxAttempts === 3, String(job.maxAttempts))

  // === Test 2: claim 任务 ===
  console.log('\n--- Test 2: claim 任务 ---')
  let claimed = await db.claimExecutionJobById(job.id)
  if (!claimed) {
    const j = await getJob(job.id)
    claimed = j && j.status === 'processing' ? j : null
    assert('claim or worker took it', !!claimed, `status=${j?.status}`)
  } else {
    assert('claimExecutionJobById works', claimed.status === 'processing', claimed.status)
  }

  // === Test 3: finish - 成功 ===
  console.log('\n--- Test 3: finish - 成功 ---')
  const t3job = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke-finish-done',
    triggerData: { t3: true },
  })
  const t3claimed = await db.claimExecutionJobById(t3job.id)
  if (t3claimed) {
    const exec = await db.createExecution({
      tenantId, workflowId,
      triggerType: 'smoke-finish-done',
      triggerData: { t3: true },
    })
    const res = await db.finishExecutionJob(t3claimed.id, 'done', exec.id, null)
    assert('finish done returns done', res === 'done', String(res))
    const after = await getJob(t3claimed.id)
    assert('job status = done', after?.status === 'done', after?.status)
    assert('attempt_count 不变', after?.attempt_count === 0, String(after?.attempt_count))
    assert('execution_id 已设置', after?.execution_id === exec.id, String(after?.execution_id))
  } else {
    assert('claim t3 job', false, '被抢走，跳过')
  }

  // === Test 4: 幂等 - 相同 dedupKey 重复入队只返回同一个 ===
  console.log('\n--- Test 4: 幂等入队 ---')
  const dedupKey = 'smoke-dedup-' + Date.now()
  const j1 = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke-dedup',
    triggerData: { n: 1 },
    dedupKey,
  })
  const j2 = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke-dedup',
    triggerData: { n: 2 },
    dedupKey,
  })
  assert('两次入队返回同一 job', j1.id === j2.id, `j1=${j1.id} j2=${j2.id}`)

  // === Test 5: 失败重试 ===
  console.log('\n--- Test 5: 失败重试 ---')
  const failJob = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke-retry',
    triggerData: { fail: true },
  })
  const claimed5 = await db.claimExecutionJobById(failJob.id)
  assert('claim 成功', !!claimed5)
  if (claimed5) {
    const r1 = await db.finishExecutionJob(claimed5.id, 'failed', null, '模拟失败1')
    assert('首次失败 → retrying', r1 === 'retrying', String(r1))
    const after1 = await getJob(claimed5.id)
    assert('attempt_count=1', after1?.attempt_count === 1, String(after1?.attempt_count))
    assert('状态回到 pending', after1?.status === 'pending', after1?.status)
    assert('last_error 有值', !!after1?.last_error, String(after1?.last_error).slice(0,30))
    assert('next_attempt_at 已设置', !!after1?.next_attempt_at, String(after1?.next_attempt_at))
  }

  // === Test 6: 达到最大重试 → 死信 ===
  console.log('\n--- Test 6: 死信 ---')
  const dlJob = await db.enqueueExecutionJob({
    tenantId, workflowId,
    triggerType: 'smoke-dl',
    triggerData: { dl: true },
  })
  let lastResult = null
  let tries = 0
  for (let i = 0; i < 20 && tries < 10; i++) {
    const c = await db.claimExecutionJobById(dlJob.id)
    if (!c) {
      await pool.query(`UPDATE execution_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1 AND status = 'pending'`, [dlJob.id])
      continue
    }
    tries++
    lastResult = await db.finishExecutionJob(c.id, 'failed', null, `死信模拟 #${tries}`)
    if (lastResult === 'dead-letter') break
  }
  assert('最终进入 dead-letter', lastResult === 'dead-letter', `lastResult=${lastResult}, tries=${tries}`)
  const afterDl = await getJob(dlJob.id)
  assert('job 状态 failed', afterDl?.status === 'failed', afterDl?.status)
  assert('dead_letter_reason 有值', !!afterDl?.dead_letter_reason, String(afterDl?.dead_letter_reason).slice(0,30))

  // 验证 dead_letters 表有记录
  const { rows: dlRows } = await pool.query('SELECT * FROM dead_letters WHERE job_id = $1', [dlJob.id])
  assert('dead_letters 表有记录', dlRows.length > 0, `count=${dlRows.length}`)
  if (dlRows[0]) {
    assert('dead_letter 有 reason', !!dlRows[0].reason, dlRows[0].reason.slice(0,20))
    assert('dead_letter 有 error', !!dlRows[0].error, String(dlRows[0].error).slice(0,20))
  }

  // === 清理测试数据 ===
  console.log('\n--- 清理测试数据 ---')
  await pool.query(`DELETE FROM execution_jobs WHERE trigger_type LIKE 'smoke%' AND tenant_id = $1`, [tenantId])
  await pool.query(`DELETE FROM dead_letters WHERE reason LIKE 'smoke%' AND tenant_id = $1`, [tenantId])
  // 把测试 execution 也清掉
  await pool.query(`DELETE FROM executions WHERE trigger_type LIKE 'smoke%' AND tenant_id = $1`, [tenantId])
  console.log('已清理 smoke 测试数据')

  // === 汇总 ===
  console.log('\n========== 汇总 ==========')
  console.log(`通过: ${pass} / ${pass+fail}`)
  console.log(`失败: ${fail}`)
  if (fail > 0) {
    console.log('失败项:')
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.detail}`))
    process.exit(1)
  }
  process.exit(0)
}

run().catch(e => { console.error('FATAL', e); process.exit(1) })
