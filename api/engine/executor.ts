import './nodes/index.js'
import { injectRunWorkflow } from './nodes/logic.js'
import { db, getStoreProfile } from '../store.js'
import {
  findStartNodes,
  nextNodeIds,
  branchTargets,
  findMergeNodeId,
} from './graph.js'
import { nodeRegistry } from './nodes/registry.js'
import {
  makeDeadline,
  isPastDeadline,
  remainingMs,
  withNodeTimeout,
  NODE_TIMEOUT_MS,
  MAX_LOOP_ITEMS,
} from './executorGuard.js'
import type { WorkflowDefinition, RunContext } from './types.js'
import { notifyExecutionFailure } from './notify.js'
import { sendMesResultCallback } from './mes.js'

function extractTriggerUserId(triggerData: unknown): string | null {
  if (!triggerData || typeof triggerData !== 'object') return null
  const v = (triggerData as Record<string, unknown>).userId
    ?? (triggerData as Record<string, unknown>).user_id
  return typeof v === 'string' ? v : null
}

/** 节点执行预算 = 单节点超时 与 整体剩余时限 取较小者（>0） */
function nodeBudget(deadlineFn: () => number): number {
  return Math.max(1, Math.min(NODE_TIMEOUT_MS, remainingMs(deadlineFn)))
}

async function runSubgraph(input: {
  tenantId: string
  executionId: string
  def: WorkflowDefinition
  startIds: string[]
  ctx: RunContext
  stopBeforeNodeIds?: Set<string>
  deadlineFn: () => number
}): Promise<{ failed: boolean; error: string }> {
  const queue = [...input.startIds]
  const visited = new Set<string>()
  let failed = false
  let lastError = ''
  const stop = input.stopBeforeNodeIds ?? new Set<string>()

  while (queue.length && !failed) {
    if (isPastDeadline(input.deadlineFn)) {
      failed = true
      lastError = '执行超时（超过整体时限）'
      break
    }
    const nodeId = queue.shift()!
    if (visited.has(nodeId) || stop.has(nodeId)) continue
    visited.add(nodeId)

    const node = input.def.nodes.find((n) => n.id === nodeId)
    if (!node || nodeRegistry.isStructural(node.type)) continue

    const executor = nodeRegistry.get(node.type)
    if (!executor) {
      failed = true
      lastError = `未注册的节点类型: ${node.type}`
      break
    }

    const step = await db.createExecutionStep({
      executionId: input.executionId,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: `${node.label} (循环体)`,
      input: { vars: { ...input.ctx.vars } },
    })

    try {
      const res = await withNodeTimeout(
        () => executor.execute({ tenantId: input.tenantId, node, ctx: input.ctx, executionId: input.executionId }),
        nodeBudget(input.deadlineFn),
        node.type,
      )
      if (!res.ok) {
        failed = true
        lastError = res.error
        await db.finishExecutionStep(step.id, 'failed', null, lastError)
        break
      }
      const output = res.data
      input.ctx.steps[node.id] = output
      await db.finishExecutionStep(step.id, 'success', output, null)
      for (const nextId of nextNodeIds(node, output, input.def.edges)) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
    } catch (e) {
      failed = true
      lastError = e instanceof Error ? e.message : String(e)
      await db.finishExecutionStep(step.id, 'failed', null, lastError)
    }
  }
  return { failed, error: lastError }
}

export async function runWorkflow(input: {
  tenantId: string
  workflowId: string
  triggerType: string
  triggerData: Record<string, unknown>
  userId?: string
  parentExecutionId?: string
  subDepth?: number
}): Promise<{ executionId: string; status: 'success' | 'failed' }> {
  const wf = await db.findWorkflowWithDefinition(input.tenantId, input.workflowId)
  if (!wf) throw new Error('工作流不存在')

  const def: WorkflowDefinition = wf.definition ?? { nodes: [], edges: [] }
  const execution = await db.createExecution({
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    triggerType: input.triggerType,
    triggerData: input.triggerData,
    parentExecutionId: input.parentExecutionId,
  })

  const store = await getStoreProfile(input.tenantId).catch(() => null)

  const ctx: RunContext = {
    trigger: input.triggerData,
    steps: {},
    vars: {
      __execution_id: execution.id,
      __sub_depth: input.subDepth ?? 0,
      store: store ?? {},
    },
    loopIndex: 0,
    loopItem: null,
  }

  const deadlineFn = makeDeadline()
  const queue = findStartNodes(def).map((n) => n.id)
  const visited = new Set<string>()
  let failed = false
  let lastError = ''

  while (queue.length && !failed) {
    if (isPastDeadline(deadlineFn)) {
      failed = true
      lastError = '执行超时（超过整体时限）'
      break
    }
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = def.nodes.find((n) => n.id === nodeId)
    if (!node) continue

    const executor = nodeRegistry.get(node.type)
    if (!executor) {
      failed = true
      lastError = `未注册的节点类型: ${node.type}`
      break
    }

    const step = await db.createExecutionStep({
      executionId: execution.id,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.label ?? node.type,
      input: { trigger: ctx.trigger, vars: ctx.vars, priorSteps: { ...ctx.steps } },
    })

    try {
      const res = await withNodeTimeout(
        () => executor.execute({ tenantId: input.tenantId, node, ctx, executionId: execution.id }),
        nodeBudget(deadlineFn),
        node.type,
      )
      if (!res.ok) {
        failed = true
        lastError = res.error
        await db.finishExecutionStep(step.id, 'failed', null, lastError)
        break
      }
      const output = res.data
      ctx.steps[node.id] = output
      await db.finishExecutionStep(step.id, 'success', output, null)

      if (executor.onAfter) {
        await executor.onAfter({ tenantId: input.tenantId, node, ctx, executionId: execution.id }, output)
      }

      if (node.type === 'logic.loop') {
        const loopOut = output as { items?: unknown[]; itemVar?: string }
        const itemVar = loopOut.itemVar ?? 'item'
        let items = loopOut.items ?? []
        if (items.length > MAX_LOOP_ITEMS) {
          ctx.vars.__loop_truncated = true
          items = items.slice(0, MAX_LOOP_ITEMS)
        }
        const bodyStarts = branchTargets(node.id, 'each', def.edges)
        for (let i = 0; i < items.length; i++) {
          ctx.vars[itemVar] = items[i]
          ctx.vars.loop_index = i
          const sub = await runSubgraph({
            tenantId: input.tenantId,
            executionId: execution.id,
            def,
            startIds: bodyStarts,
            ctx,
            deadlineFn,
          })
          if (sub.failed) {
            failed = true
            lastError = sub.error
            break
          }
        }
        if (!failed) {
          for (const nextId of branchTargets(node.id, 'done', def.edges)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        }
        continue
      }

      if (node.type === 'logic.parallel') {
        const branchStarts = def.edges.filter((e) => e.source === node.id).map((e) => e.target)
        const mergeId = findMergeNodeId(node.id, def)
        const stopSet = mergeId ? new Set([mergeId]) : new Set<string>()
        const results = await Promise.all(
          branchStarts.map((startId) =>
            runSubgraph({
              tenantId: input.tenantId,
              executionId: execution.id,
              def,
              startIds: [startId],
              ctx: { trigger: { ...ctx.trigger }, steps: { ...ctx.steps }, vars: { ...ctx.vars }, loopIndex: 0, loopItem: null },
              stopBeforeNodeIds: stopSet,
              deadlineFn,
            }),
          ),
        )
        const bad = results.find((r) => r.failed)
        if (bad) {
          failed = true
          lastError = bad.error
        } else if (mergeId && !visited.has(mergeId)) {
          queue.push(mergeId)
        } else {
          for (const nextId of nextNodeIds(node, output, def.edges)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        }
        continue
      }

      if (node.type === 'logic.try') {
        const tryBodyStarts = def.edges.filter((e) => e.source === node.id && e.sourceHandle !== 'catch').map((e) => e.target)
        const catchEdges = def.edges.filter((e) => e.source === node.id && e.sourceHandle === 'catch')
        const tryCtx: RunContext = { trigger: { ...ctx.trigger }, steps: { ...ctx.steps }, vars: { ...ctx.vars }, loopIndex: 0, loopItem: null }
        const sub = await runSubgraph({
          tenantId: input.tenantId,
          executionId: execution.id,
          def,
          startIds: tryBodyStarts,
          ctx: tryCtx,
          deadlineFn,
        })
        if (sub.failed) {
          ctx.vars.__try_error = sub.error
          for (const nextId of catchEdges.map((e) => e.target)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        } else {
          ctx.steps = { ...ctx.steps, ...tryCtx.steps }
          ctx.vars = { ...ctx.vars, ...tryCtx.vars }
          const afterEdges = def.edges.filter((e) => e.source === node.id && !e.sourceHandle)
          for (const nextId of afterEdges.map((e) => e.target)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        }
        continue
      }

      for (const nextId of nextNodeIds(node, output, def.edges)) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
    } catch (e) {
      failed = true
      lastError = e instanceof Error ? e.message : String(e)
      await db.finishExecutionStep(step.id, 'failed', null, lastError)
    }
  }

  await db.finishExecution(execution.id, failed ? 'failed' : 'success', failed ? lastError : null)
  // N5: 失败时异步推送告警（fire-and-forget，不阻断返回）
  if (failed) {
    void notifyExecutionFailure({
      executionId: execution.id,
      workflowId: execution.workflowId,
      tenantId: execution.tenantId,
      triggeredByUserId: extractTriggerUserId(execution.triggerData),
      title: `工作流执行失败：${execution.workflowId}`,
      message: lastError ?? '未知错误',
      errorMessage: lastError ?? null,
      severity: 'error',
    }).catch((e) => console.error('[executor] notifyExecutionFailure failed:', e))
  }
  // O5: MES 事件触发的工作流执行结束后，把执行结果异步写回 MES 回调地址（fire-and-forget）
  if (workflowHasTrigger(def, 'trigger.mes')) {
    void sendMesResultCallback({
      tenantId: input.tenantId,
      workflowId: input.workflowId,
      def,
      execution: { id: execution.id, status: failed ? 'failed' : 'success', error: failed ? lastError : null },
      trigger: input.triggerData,
      steps: ctx.steps,
    }).catch((e) => console.error('[executor] MES 结果写回失败:', e))
  }
  return { executionId: execution.id, status: failed ? 'failed' : 'success' }
}

export function workflowHasTrigger(def: WorkflowDefinition, triggerType: string): boolean {
  return def.nodes.some((n) => n.type === triggerType)
}

export async function triggerMatchingWorkflows(
  tenantId: string,
  triggerType: string,
  triggerData: Record<string, unknown>,
): Promise<string[]> {
  const workflows = await db.listPublishedWorkflows(tenantId)
  const jobIds: string[] = []
  for (const wf of workflows) {
    const def = wf.definition ?? { nodes: [], edges: [] }
    if (workflowHasTrigger(def, triggerType)) {
      const job = await db.enqueueExecutionJob({
        tenantId,
        workflowId: wf.id,
        triggerType,
        triggerData,
      })
      jobIds.push(job.id)
    }
  }
  return jobIds
}

injectRunWorkflow(() => runWorkflow)

export async function syncWorkflowTriggers(
  tenantId: string,
  workflowId: string,
  def: WorkflowDefinition,
): Promise<void> {
  await db.clearWorkflowTriggers(tenantId, workflowId)
  for (const node of def.nodes) {
    if (node.type === 'trigger.webhook') {
      const path = String(node.config?.path ?? '').trim()
      const event = String(node.config?.event ?? '').trim()
      const mode = String(node.config?.mode ?? 'webhook').trim()
      const secret = String(node.config?.secret ?? '').trim()
      if (mode === 'event' && event) {
        // O5 事件订阅总线：多个工作流订阅同一事件名，外部系统统一触发
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'webhook',
          config: { event, secret, mode: 'event' },
        })
      } else if (path) {
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'webhook',
          config: { path, secret },
        })
      }
    }
    if (node.type === 'trigger.cron') {
      const cron = String(node.config?.cron ?? '').trim()
      if (cron) {
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'cron',
          config: { cron, timezone: node.config?.timezone ?? 'Asia/Shanghai' },
        })
      }
    }
    if (node.type === 'trigger.mes') {
      // O5: MES 事件触发器 — 订阅事件总线 + 结果写回回调地址
      const event = String(node.config?.event ?? '').trim()
      const mode = String(node.config?.mode ?? 'mes').trim()
      const secret = String(node.config?.secret ?? '').trim()
      if (event) {
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'mes',
          config: {
            event,
            secret,
            mode,
            callbackUrl: String(node.config?.callbackUrl ?? '').trim(),
            callbackMethod: String(node.config?.callbackMethod ?? 'POST').trim(),
            callbackHeaders: String(node.config?.callbackHeaders ?? '').trim(),
          },
        })
      }
    }
  }
}