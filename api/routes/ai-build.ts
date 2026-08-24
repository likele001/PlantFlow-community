// api/routes/ai-build.ts
// N3: AI 辅助搭建 - 自然语言 -> 工作流定义 / Agent 配置
// 设计：
//   1. 强 system prompt 约束 LLM 输出严格 JSON，匹配 WorkflowDefinition / Agent schema
//   2. JSON 解析失败时重试一次（注入 "只返回 JSON" 指令）
//   3. 两次都失败时按关键词规则做结构化模板生成，保证前端永远能拿到可用的草稿
//   4. 入参 tenantId 来自 auth，前端拿到草稿后再 POST /api/workflows 或 /api/agents 保存

import { Router, type Response } from 'express'
import { chatCompletion } from '../engine/llm.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const r = Router()

function ok(res: Response, data: unknown) {
  res.json({ success: true, data })
}
function bad(res: Response, error: string, code = 400) {
  res.status(code).json({ success: false, error })
}

// ===== 常量：节点类型枚举 + 工具枚举 =====

const TRIGGERS = [
  'trigger.manual',
  'trigger.cron',
  'trigger.webhook',
  'trigger.chat',
  'trigger.wecom',
  'trigger.feishu',
  'trigger.dingtalk',
  'trigger.taobao',
  'trigger.mes',
] as const

const AI_NODES = ['ai.chat', 'ai.agent', 'ai.knowledge'] as const
const HTTP_NODES = ['http.request'] as const
const LOGIC_NODES = [
  'logic.if',
  'logic.code',
  'logic.delay',
  'logic.set',
  'logic.json.parse',
  'logic.loop',
  'logic.parallel',
  'logic.split',
  'logic.switch',
  'logic.join',
  'logic.merge',
  'logic.date',
  'logic.try',
  'logic.catch',
] as const
const CHANNEL_NODES = ['channel.send'] as const
const WORKFLOW_NODES = ['workflow.sub'] as const
const FEISHU_NODES = ['feishu.create', 'feishu.list'] as const
const WECOM_NODES = ['wecom.send', 'wecom.list'] as const

const ALL_NODE_TYPES: string[] = [
  ...TRIGGERS,
  ...AI_NODES,
  ...HTTP_NODES,
  ...LOGIC_NODES,
  ...CHANNEL_NODES,
  ...WORKFLOW_NODES,
  ...FEISHU_NODES,
  ...WECOM_NODES,
]

const AGENT_TOOLS = [
  'data_access.query',
  'knowledge.search',
  'workflow.run',
  'http.request',
  'agent.invoke',
] as const

// ===== 工具：JSON 抽取 =====

/**
 * 从 LLM 响应中提取 JSON 块（容错：去掉 ```json fences、处理尾部逗号、找首对完整 {}）
 */
function extractJson(text: string): unknown | null {
  if (!text) return null
  // 1) 优先匹配 ```json ... ``` 代码块
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (fence) {
    const parsed = tryParse(fence[1])
    if (parsed) return parsed
  }
  // 2) 整段尝试
  const whole = tryParse(text)
  if (whole) return whole
  // 3) 截取首段 {...}（含嵌套）
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return tryParse(text.slice(start, end + 1))
  }
  return null
}

function tryParse(s: string): unknown | null {
  try {
    return JSON.parse(s)
  } catch {
    try {
      const fixed = s.replace(/,(\s*[}\]])/g, '$1')
      return JSON.parse(fixed)
    } catch {
      return null
    }
  }
}

// ===== 校验：节点图基础结构 =====

interface GeneratedNode {
  id: string
  type: string
  label?: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}
interface GeneratedEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  label?: string
}
interface GeneratedWorkflow {
  name: string
  description?: string
  definition: { nodes: GeneratedNode[]; edges: GeneratedEdge[] }
}

function validateWorkflow(obj: unknown): GeneratedWorkflow | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const def = o.definition as Record<string, unknown> | undefined
  if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) return null

  const nodes: GeneratedNode[] = []
  for (const n of def.nodes as unknown[]) {
    if (!n || typeof n !== 'object') continue
    const nn = n as Record<string, unknown>
    if (typeof nn.id !== 'string' || typeof nn.type !== 'string') continue
    if (!ALL_NODE_TYPES.includes(nn.type)) continue
    nodes.push({
      id: nn.id,
      type: nn.type,
      label: typeof nn.label === 'string' ? nn.label : undefined,
      config: (nn.config as Record<string, unknown>) ?? {},
      position:
        nn.position && typeof nn.position === 'object'
          ? (nn.position as { x: number; y: number })
          : undefined,
    })
  }
  const validIds = new Set(nodes.map((n) => n.id))
  const edges: GeneratedEdge[] = []
  for (const e of def.edges as unknown[]) {
    if (!e || typeof e !== 'object') continue
    const ee = e as Record<string, unknown>
    if (typeof ee.source !== 'string' || typeof ee.target !== 'string') continue
    if (!validIds.has(ee.source) || !validIds.has(ee.target)) continue
    edges.push({
      id: typeof ee.id === 'string' ? ee.id : `e_${ee.source}_${ee.target}`,
      source: ee.source,
      target: ee.target,
      sourceHandle: typeof ee.sourceHandle === 'string' ? ee.sourceHandle : undefined,
      label: typeof ee.label === 'string' ? ee.label : undefined,
    })
  }
  if (nodes.length === 0) return null
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name : 'AI 生成的工作流',
    description: typeof o.description === 'string' ? o.description : undefined,
    definition: { nodes, edges },
  }
}

interface GeneratedAgent {
  name: string
  description: string
  systemPrompt: string
  tools: string[]
  allowedSources: string[]
  maxTurns: number
  timeoutMs: number
}

function validateAgent(obj: unknown): GeneratedAgent | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const tools = Array.isArray(o.tools)
    ? (o.tools as unknown[]).filter(
        (t): t is string => typeof t === 'string' && (AGENT_TOOLS as readonly string[]).includes(t),
      )
    : []
  const allowedSources = Array.isArray(o.allowedSources)
    ? (o.allowedSources as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'AI 生成的 Agent'
  const description = typeof o.description === 'string' ? o.description : ''
  const systemPrompt = typeof o.systemPrompt === 'string' ? o.systemPrompt : ''
  const maxTurns = typeof o.maxTurns === 'number' && o.maxTurns > 0 ? Math.min(20, Math.floor(o.maxTurns)) : 8
  const timeoutMs =
    typeof o.timeoutMs === 'number' && o.timeoutMs > 0 ? Math.min(300000, Math.floor(o.timeoutMs)) : 120000

  if (!systemPrompt) return null
  return { name, description, systemPrompt, tools, allowedSources, maxTurns, timeoutMs }
}

// ===== 兜底：关键词驱动的结构化模板 =====

function fallbackWorkflow(description: string, hint?: string): GeneratedWorkflow {
  const text = `${description} ${hint ?? ''}`.toLowerCase()
  const hasCron = /每天|定时|定时器|cron|周期|日报|周报|每小时/.test(text)
  const hasChat = /对话|聊天|客服|问答|chat/.test(text)
  const hasWebhook = /webhook|回调|推送|外部/.test(text)
  const hasFeishu = /飞书|feishu/.test(text)
  const hasWeCom = /企微|wecom/.test(text)
  const hasHttp = /接口|api|http|请求/.test(text)
  const hasAiChat = /总结|汇总|分析|生成|润色|改写|翻译|对话|答疑/.test(text)
  const hasIf = /如果|判断|分支|条件/.test(text)
  const hasLoop = /遍历|循环|每条|每个|列表/.test(text)
  const hasDelay = /延时|等待|睡|sleep/.test(text)

  let trigger: string = 'trigger.manual'
  if (hasCron) trigger = 'trigger.cron'
  else if (hasWebhook) trigger = 'trigger.webhook'
  else if (hasChat) trigger = 'trigger.chat'

  const nodes: GeneratedNode[] = []
  const edges: GeneratedEdge[] = []
  let y = 80

  nodes.push({
    id: 't1',
    type: trigger,
    label: '触发器',
    config: hasCron ? { schedule: '0 9 * * *' } : {},
    position: { x: 80, y },
  })
  y += 140
  let prev = 't1'
  let idx = 1

  if (hasHttp) {
    const id = `n${idx++}`
    nodes.push({
      id,
      type: 'http.request',
      label: '拉取数据',
      config: { method: 'GET', url: '' },
      position: { x: 80, y },
    })
    edges.push({ id: `e_${prev}_${id}`, source: prev, target: id })
    prev = id
    y += 140
  }
  if (hasAiChat) {
    const id = `n${idx++}`
    nodes.push({
      id,
      type: 'ai.chat',
      label: 'AI 处理',
      config: { systemPrompt: '请基于以下输入生成结构化总结。', userMessage: '{{steps.t1}}' },
      position: { x: 80, y },
    })
    edges.push({ id: `e_${prev}_${id}`, source: prev, target: id })
    prev = id
    y += 140
  }
  if (hasIf) {
    const id = `n${idx++}`
    nodes.push({
      id,
      type: 'logic.if',
      label: '条件判断',
      config: { expression: 'true' },
      position: { x: 80, y },
    })
    edges.push({ id: `e_${prev}_${id}`, source: prev, target: id })
    prev = id
    y += 140
  }
  if (hasLoop) {
    const id = `n${idx++}`
    nodes.push({
      id,
      type: 'logic.loop',
      label: '循环',
      config: { items: '[]', itemVar: 'item' },
      position: { x: 80, y },
    })
    edges.push({ id: `e_${prev}_${id}`, source: prev, target: id })
    prev = id
    y += 140
  }
  if (hasDelay) {
    const id = `n${idx++}`
    nodes.push({
      id,
      type: 'logic.delay',
      label: '延时',
      config: { ms: 1000 },
      position: { x: 80, y },
    })
    edges.push({ id: `e_${prev}_${id}`, source: prev, target: id })
    prev = id
    y += 140
  }
  const outId = `n${idx++}`
  if (hasFeishu) {
    nodes.push({
      id: outId,
      type: 'feishu.create',
      label: '飞书发送',
      config: { type: 'message', title: 'AI 消息', content: '{{steps.t1}}' },
      position: { x: 80, y },
    })
  } else if (hasWeCom) {
    nodes.push({
      id: outId,
      type: 'wecom.send',
      label: '企微发送',
      config: { type: 'text', content: '{{steps.t1}}' },
      position: { x: 80, y },
    })
  } else {
    nodes.push({
      id: outId,
      type: 'channel.send',
      label: '发送消息',
      config: { channel: 'console', text: '{{steps.t1}}' },
      position: { x: 80, y },
    })
  }
  edges.push({ id: `e_${prev}_${outId}`, source: prev, target: outId })

  return {
    name: deriveName(description, '工作流'),
    description: description.slice(0, 200),
    definition: { nodes, edges },
  }
}

function fallbackAgent(description: string, hint?: string): GeneratedAgent {
  const text = `${description} ${hint ?? ''}`.toLowerCase()
  const hasQuery = /查|数据库|sql|数据源|query|select/.test(text)
  const hasKnowledge = /知识|文档|手册|知识库|检索/.test(text)
  const hasHttp = /接口|http|api|请求/.test(text)
  const hasWorkflow = /触发工作流|跑工作流|workflow/.test(text)
  const hasSubAgent = /调度|分派|拆分子任务|多 agent|multi-?agent/.test(text)

  const tools: string[] = []
  if (hasQuery) tools.push('data_access.query')
  if (hasKnowledge) tools.push('knowledge.search')
  if (hasHttp) tools.push('http.request')
  if (hasWorkflow) tools.push('workflow.run')
  if (hasSubAgent) tools.push('agent.invoke')

  if (tools.length === 0) tools.push('http.request')

  const sys = [
    `你是一个「${deriveName(description, '助手')}」。`,
    `用户需求：${description.trim().slice(0, 400)}`,
    '',
    '请遵守以下原则：',
    '1. 先判断需要调用哪些工具获取真实数据，再结合工具结果给出最终答复。',
    '2. 答案尽量结构化（列表/表格），便于后续处理。',
    '3. 若数据缺失或工具调用失败，明确说明并给出建议。',
  ].join('\n')

  return {
    name: deriveName(description, 'Agent'),
    description: description.trim().slice(0, 200),
    systemPrompt: sys,
    tools,
    allowedSources: [],
    maxTurns: 8,
    timeoutMs: 120000,
  }
}

function deriveName(description: string, fallback: string): string {
  const first = description
    .split(/[，。,.；;\n]/)[0]
    ?.trim()
    ?.slice(0, 16)
  return first || `AI 生成的${fallback}`
}

// ===== LLM 调用：单次 + 重试 =====

async function callLLMJson(tenantId: string, system: string, user: string): Promise<unknown | null> {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  try {
    const res = await chatCompletion(tenantId, messages, { temperature: 0.3 })
    const text = (res as { content?: string }).content ?? ''
    const parsed = extractJson(text)
    if (parsed) return parsed
    const retry = await chatCompletion(
      tenantId,
      [
        ...messages,
        { role: 'assistant', content: text },
        {
          role: 'user',
          content:
            '你的上一次回复无法解析为合法 JSON。请只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。',
        },
      ],
      { temperature: 0.1 },
    )
    return extractJson((retry as { content?: string }).content ?? '')
  } catch {
    return null
  }
}

// ===== 路由：工作流 =====

r.post('/workflow', requireAuth, async (req: AuthedRequest, res) => {
  const { description, hint } = (req.body ?? {}) as { description?: string; hint?: string }
  if (!description?.trim()) return bad(res, 'description 为必填')

  const system = [
    '你是一个工作流编排助手，根据用户自然语言描述生成工作流定义。',
    '只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。',
    '',
    'JSON 结构：',
    '{ "name": string, "description": string,',
    '  "definition": { "nodes": Node[], "edges": Edge[] } }',
    '',
    'Node 字段：id (string), type (string from NODE_TYPES), label?, config? (object), position? {x,y}',
    'Edge 字段：id (string), source (Node.id), target (Node.id), sourceHandle?, label?',
    '',
    '可用节点类型（必须严格使用下列 type）：',
    [...TRIGGERS].join(', '),
    [...AI_NODES, ...HTTP_NODES].join(', '),
    [...LOGIC_NODES].join(', '),
    [...CHANNEL_NODES, ...WORKFLOW_NODES].join(', '),
    [...FEISHU_NODES, ...WECOM_NODES].join(', '),
    '',
    '规则：',
    '1. 第一个节点必须是 trigger.* 类型；手动触发用 trigger.manual，定时用 trigger.cron 并填写 cron schedule；',
    '2. 节点 id 用 t1/n1/n2/... 这种短字符串；',
    '3. edges 用 e_<source>_<target> 形式；',
    '4. config 中的表达式/变量用 {{steps.<nodeId>}} 占位；',
    '5. 飞书发送用 feishu.create，企微发送用 wecom.send，其他情况用 channel.send；',
    '6. 只生成与描述直接相关的节点，不要无关分支；',
    '7. 节点位置 x 全部用 80，y 依次递增 140。',
  ].join('\n')

  const user = `需求描述：${description}\n${hint ? `补充提示：${hint}\n` : ''}请按规则输出 JSON。`

  const parsed = await callLLMJson(req.auth!.tenantId, system, user)
  const validated = validateWorkflow(parsed)
  const wf = validated ?? fallbackWorkflow(description, hint)
  ok(res, { ...wf, source: validated ? 'llm' : 'fallback' })
})

// ===== 路由：工作流 AI 改图（基于当前定义 + 修改指令） =====

r.post('/workflow/edit', requireAuth, async (req: AuthedRequest, res) => {
  const { description, definition } = (req.body ?? {}) as {
    description?: string
    definition?: { nodes: unknown[]; edges: unknown[] }
  }
  if (!description?.trim()) return bad(res, 'description 为必填')
  if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    return bad(res, 'definition 为必填（当前画布的工作流定义）')
  }

  const system = [
    '你是一个工作流编排助手。用户会给你「当前工作流定义」JSON 和一条「修改指令」，请基于当前定义完成修改，并输出完整的新工作流定义 JSON。',
    '只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。',
    '',
    'JSON 结构：',
    '{ "name": string, "description": string, "changes": string[],',
    '  "definition": { "nodes": Node[], "edges": Edge[] } }',
    '',
    'Node 字段：id (string), type (string from NODE_TYPES), label?, config? (object), position? {x,y}',
    'Edge 字段：id (string), source (Node.id), target (Node.id), sourceHandle?, label?',
    '',
    '可用节点类型（必须严格使用下列 type）：',
    [...TRIGGERS].join(', '),
    [...AI_NODES, ...HTTP_NODES].join(', '),
    [...LOGIC_NODES].join(', '),
    [...CHANNEL_NODES, ...WORKFLOW_NODES].join(', '),
    [...FEISHU_NODES, ...WECOM_NODES].join(', '),
    '',
    '规则：',
    '1. 未涉及修改的节点必须原样保留（id、type、label、config、position 全部不变）；',
    '2. 修改指令只影响相关节点与连线，不要重建整张图；',
    '3. edges 的 source/target 必须引用输出 nodes 中存在的 id；',
    '4. 删除节点时，同时删除与其相连的 edges；',
    '5. 新增节点 id 用 t1/n1/n2/... 这种短字符串，position 的 y 与相邻节点对齐；',
    '6. config 中的表达式/变量用 {{steps.<nodeId>}} 占位；',
    '7. changes 为 string[]，用中文逐条说明每一步修改（如"新增节点：AI 对话"、"修改 n2 的提示词"），没有修改则为空数组。',
  ].join('\n')

  const user = [
    '当前工作流定义：',
    JSON.stringify({ nodes: definition.nodes, edges: definition.edges }),
    '',
    `修改指令：${description.trim()}`,
    '',
    '请按规则输出完整的新工作流定义 JSON。',
  ].join('\n')

  const parsed = await callLLMJson(req.auth!.tenantId, system, user)
  const validated = validateWorkflow(parsed)
  if (!validated) {
    // fallback：原样返回当前定义，前端提示重试
    return ok(res, {
      name: '未修改',
      changes: ['AI 未能解析修改结果，已保持原图。请调整指令后重试。'],
      definition,
      source: 'fallback',
    })
  }
  const raw = parsed as Record<string, unknown>
  const changes = Array.isArray(raw?.changes)
    ? (raw.changes as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 20)
    : []
  ok(res, { ...validated, changes, source: 'llm' })
})

// ===== 路由：Agent =====

r.post('/agent', requireAuth, async (req: AuthedRequest, res) => {
  const { description, industry } = (req.body ?? {}) as { description?: string; industry?: string }
  if (!description?.trim()) return bad(res, 'description 为必填')

  const system = [
    '你是一个 Agent 设计助手，根据用户自然语言需求生成一个可执行 Agent 的配置。',
    '只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。',
    '',
    'JSON 结构：',
    '{',
    '  "name": string,                // Agent 名称，简洁、不超过 16 字',
    '  "description": string,         // 一句话说明',
    '  "systemPrompt": string,        // 至少 80 字的角色设定 + 工作原则',
    '  "tools": string[],             // 只能从 TOOLS 中选',
    '  "allowedSources": string[],    // 数据源 ID 列表（无则空数组）',
    '  "maxTurns": number,            // 1-20，默认 8',
    '  "timeoutMs": number            // 30000-300000，默认 120000',
    '}',
    '',
    '可用工具（必须严格使用下列字符串）：',
    AGENT_TOOLS.join(', '),
    '',
    '规则：',
    '1. 只挑选与需求直接相关的工具；',
    '2. systemPrompt 必须明确角色定位、回答风格与边界；',
    '3. allowedSources 留空数组（用户后续在 UI 中勾选具体数据源）；',
    '4. 不要编造数据源 ID 或工具名。',
  ].join('\n')

  const user = `需求描述：${description}\n${industry ? `行业：${industry}\n` : ''}请按规则输出 JSON。`

  const parsed = await callLLMJson(req.auth!.tenantId, system, user)
  const validated = validateAgent(parsed)
  const agent = validated ?? fallbackAgent(description)
  ok(res, { ...agent, source: validated ? 'llm' : 'fallback' })
})

export default r