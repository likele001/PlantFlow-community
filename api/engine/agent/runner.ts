// api/engine/agent/runner.ts
// N1-A Agent 执行循环

import { db } from '../../store.js'
import type { Agent, AgentSession } from '../../store.js'
import { chatCompletion } from '../llm.js'
import {
  listAgentTools,
  toolsToOpenAiFormat,
  getTool,
} from './tools.js'

export interface AgentRunResult {
  reply: string
  turns: number
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown; durationMs: number }>
  totalDurationMs: number
}

interface ToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: string
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export async function runAgent(input: {
  tenantId: string
  agentId: string
  sessionId?: string
  userMessage: string
  channel?: string
  externalId?: string
  depth?: number
}): Promise<AgentRunResult> {
  const startTime = Date.now()
  const { tenantId, agentId, userMessage } = input
  const depth = input.depth ?? 0

  // 1. 加载 agent
  const agent = await db.findAgent(tenantId, agentId)
  if (!agent) throw new Error('Agent 不存在')
  if (agent.status === 'disabled') throw new Error('Agent 已禁用')

  // 2. 获取或创建会话
  let session: AgentSession
  if (input.sessionId) {
    const s = await db.getAgentSession(tenantId, input.sessionId)
    if (!s) throw new Error('会话不存在')
    session = s
  } else {
    session = await db.getOrCreateAgentSession({
      tenantId,
      agentId,
      channel: input.channel,
      externalId: input.externalId,
    })
  }

  // 3. 组装消息
  const messages: ChatMessage[] = []
  // system prompt
  if (agent.systemPrompt) {
    messages.push({ role: 'system', content: agent.systemPrompt })
  }
  // 历史消息（取最近 N 条，避免上下文过长）
  const history = session.history as ChatMessage[]
  const recentHistory = history.slice(-20)
  messages.push(...recentHistory)
  // 用户消息
  messages.push({ role: 'user', content: userMessage })

  // 4. 工具列表
  const tools = listAgentTools(agent)
  const openAiTools = toolsToOpenAiFormat(tools)

  const toolCalls: AgentRunResult['toolCalls'] = []
  let finalReply = ''

  // 5. 执行循环
  for (let turn = 0; turn < agent.maxTurns; turn++) {
    // 超时检查
    if (Date.now() - startTime > agent.timeoutMs) {
      finalReply = '（执行超时，已中止）'
      break
    }

    // 转为 chatCompletion 期望的格式（content 必须是 string）
    const llmMessages = messages.map(m => ({
      role: m.role,
      content: m.content ?? '',
      tool_calls: m.tool_calls,
    }))
    const replyMsg = await chatCompletion(tenantId, llmMessages, {
      tools: openAiTools.length > 0 ? openAiTools : undefined,
    })

    const content = (replyMsg.content as string) ?? ''
    const msgToolCalls = (replyMsg.tool_calls as ToolCall[] | undefined) ?? []

    if (msgToolCalls.length === 0) {
      // 无工具调用 → 结束
      finalReply = content
      const assistantMsg: ChatMessage = { role: 'assistant', content }
      messages.push(assistantMsg)
      break
    }

    // 有工具调用 → 先保存 assistant 消息（带 tool_calls）
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: content || null,
      tool_calls: msgToolCalls,
    }
    messages.push(assistantMsg)

    // N1-B: 并行执行本轮的多个工具调用（无依赖子任务同时派发，Promise.all 保持顺序与 tool_call_id 对齐）
    await Promise.all(msgToolCalls.map(async (tc) => {
      const toolName = tc.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        args = { raw: tc.function.arguments }
      }

      const tool = getTool(toolName)
      const toolStart = Date.now()
      let result: unknown

      if (!tool) {
        result = { error: `未知工具: ${toolName}` }
      } else {
        try {
          result = await tool.invoke({ tenantId, agent, session, args, depth })
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) }
        }
      }

      const durationMs = Date.now() - toolStart
      toolCalls.push({ name: toolName, args, result, durationMs })

      // 将工具结果加入 messages
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    }))
  }

  // 6. 写回会话历史（保留最近 50 条）
  const allHistory = [...history, ...messages.slice(history.length === 0 ? 1 : 0)]
  const trimmedHistory = allHistory.slice(-50)
  await db.updateAgentSessionHistory(tenantId, session.id, trimmedHistory as AgentSession['history'])

  return {
    reply: finalReply,
    turns: toolCalls.length > 0 ? toolCalls.length + 1 : 1,
    toolCalls,
    totalDurationMs: Date.now() - startTime,
  }
}
