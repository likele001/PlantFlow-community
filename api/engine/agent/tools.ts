// api/engine/agent/tools.ts
// N1-A Tool Registry - 工具注册与调用
// N1-B: 新增 agent.invoke，实现多 Agent 协作原语

import { db } from '../../store.js'
import type { Agent, AgentSession } from '../../store.js'
import { executeQuery } from '../../data-access/index.js'

// Agent 调用嵌套最大深度（防止递归死循环）
export const MAX_AGENT_DEPTH = Number(process.env.MAX_AGENT_DEPTH ?? 5)

export interface ToolSchema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
}

export interface Tool {
  name: string
  description: string
  schema: ToolSchema
  invoke(ctx: {
    tenantId: string
    agent: Agent
    session: AgentSession
    args: Record<string, unknown>
    depth?: number
  }): Promise<unknown>
}

const registry: Record<string, Tool> = {}

export function registerTool(tool: Tool): void {
  registry[tool.name] = tool
}

export function getTool(name: string): Tool | undefined {
  return registry[name]
}

export function listAgentTools(agent: Agent): Tool[] {
  const allowed = new Set(agent.tools)
  return Object.values(registry).filter(t => allowed.has(t.name) || allowed.size === 0)
}

export function toolsToOpenAiFormat(tools: Tool[]): unknown[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }))
}

// ========== 内置工具 ==========

// data_access.query
registerTool({
  name: 'data_access.query',
  description: '对指定数据源执行只读查询，返回查询结果。数据源必须在 agent 允许列表中。',
  schema: {
    type: 'object',
    properties: {
      sourceId: { type: 'string', description: '数据源 ID' },
      query: { type: 'string', description: '查询语句（SQL 或 HTTP 请求 JSON）' },
      params: { type: 'array', description: '查询参数（可选）', items: {} },
    },
    required: ['sourceId', 'query'],
  },
  async invoke({ tenantId, agent, args }) {
    const sourceId = String(args.sourceId ?? '')
    const query = String(args.query ?? '')
    // 权限校验：数据源必须在 agent.allowedSources 中
    if (agent.allowedSources.length > 0 && !agent.allowedSources.includes(sourceId)) {
      throw new Error('该数据源不在 Agent 允许访问列表中')
    }
    const params = Array.isArray(args.params) ? args.params : undefined
    const result = await executeQuery(tenantId, sourceId, query, params)
    return result
  },
})

// knowledge.search
registerTool({
  name: 'knowledge.search',
  description: '在知识库中检索相关文档片段，返回最相关的 chunks。',
  schema: {
    type: 'object',
    properties: {
      knowledgeBaseId: { type: 'string', description: '知识库 ID' },
      query: { type: 'string', description: '检索关键词或问题' },
      limit: { type: 'number', description: '返回数量上限，默认 5' },
    },
    required: ['knowledgeBaseId', 'query'],
  },
  async invoke({ tenantId, args }) {
    const kbId = String(args.knowledgeBaseId ?? '')
    const query = String(args.query ?? '')
    const limit = Number(args.limit ?? 5)
    const hits = await db.searchKnowledgeChunks(tenantId, kbId, query, limit)
    return hits
  },
})

// workflow.run
registerTool({
  name: 'workflow.run',
  description: '触发执行一个已发布的工作流，同步等待并返回执行结果。',
  schema: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: '工作流 ID' },
      inputData: { type: 'object', description: '工作流输入数据' },
    },
    required: ['workflowId'],
  },
  async invoke({ tenantId, args }) {
    const workflowId = String(args.workflowId ?? '')
    const inputData = (args.inputData as Record<string, unknown>) ?? {}
    // 动态导入避免循环依赖
    const { runWorkflow } = await import('../executor.js')
    const result = await runWorkflow({
      tenantId,
      workflowId,
      triggerType: 'agent',
      triggerData: inputData,
    })
    return result
  },
})

// http.request（复用 SSRF + credential 头注入）
registerTool({
  name: 'http.request',
  description: '发起一次只读 HTTP 请求并返回响应体。可用于调用自研接口或第三方 API。',
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '请求 URL' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT'], description: '默认 GET' },
      headers: { type: 'object', description: '自定义请求头' },
      body: { type: 'object', description: 'POST/PUT 请求体（可选）' },
    },
    required: ['url'],
  },
  async invoke({ args }) {
    const { validateUrl } = await import('../../engine/ssrf.js')
    const url = String(args.url ?? '')
    if (!url) throw new Error('缺少 url')
    validateUrl(url)
    const method = String(args.method ?? 'GET').toUpperCase()
    const headers = (args.headers as Record<string, string>) ?? {}
    const body =
      args.body !== undefined
        ? typeof args.body === 'string'
          ? args.body
          : JSON.stringify(args.body)
        : undefined
    const r = await fetch(url, { method, headers, body })
    const text = await r.text()
    return { status: r.status, body: text.slice(0, 4000) }
  },
})

// agent.invoke — N1-B: 多 Agent 协作原语，主 Agent 分派任务给子 Agent
registerTool({
  name: 'agent.invoke',
  description:
    '调用另一个 Agent 执行子任务并返回其结果。当你需要拆分子任务时使用：如「查询资据」交给查询 Agent、「生成报表」交给报表 Agent。可将多个独立子任务在同一轮并行派发给多个 Agent。',
  schema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: '要调用的子 Agent ID' },
      task: { type: 'string', description: '交给子 Agent 的子任务描述' },
    },
    required: ['agentId', 'task'],
  },
  async invoke({ tenantId, agent, args, depth = 0 }) {
    const targetId = String(args.agentId ?? '')
    const task = String(args.task ?? '')
    if (!targetId) throw new Error('缺少 agentId')
    if (!task.trim()) throw new Error('缺少任务描述')
    if (targetId === agent.id) throw new Error('不允许 Agent 调用自身')
    if (depth >= MAX_AGENT_DEPTH) {
      throw new Error(`Agent 调用嵌套过深（上限 ${MAX_AGENT_DEPTH}）`)
    }
    // 动态导入，避免循环依赖
    const { runAgent } = await import('./runner.js')
    const sub = await runAgent({
      tenantId,
      agentId: targetId,
      userMessage: task,
      channel: 'orchestrator',
      externalId: agent.id,
      depth: depth + 1,
    })
    return { subAgentId: targetId, reply: sub.reply, turns: sub.turns, toolCalls: sub.toolCalls }
  },
})