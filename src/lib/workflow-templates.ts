import type { WorkflowDefinition } from '@/lib/workflow-nodes'
import { defaultNodeConfig } from '@/lib/workflow-nodes'

export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  build: () => WorkflowDefinition
}

function nid() {
  return crypto.randomUUID()
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'ai-chat',
    name: 'AI 智能问答',
    description: '手动触发 → AI 对话',
    build: () => {
      const t = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.manual', label: '手动触发', config: {}, position: { x: 80, y: 120 } },
          {
            id: a,
            type: 'ai.chat',
            label: 'AI 对话',
            config: defaultNodeConfig('ai.chat'),
            position: { x: 320, y: 120 },
          },
        ],
        edges: [{ id: `e-${t}-${a}`, source: t, target: a }],
      }
    },
  },
  {
    id: 'rag',
    name: '知识库 RAG',
    description: '检索知识库 → AI 汇总回答',
    build: () => {
      const t = nid()
      const k = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.manual', label: '手动触发', config: {}, position: { x: 60, y: 140 } },
          {
            id: k,
            type: 'ai.knowledge',
            label: '知识库检索',
            config: defaultNodeConfig('ai.knowledge'),
            position: { x: 280, y: 140 },
          },
          {
            id: a,
            type: 'ai.chat',
            label: 'AI 汇总',
            config: {
              ...defaultNodeConfig('ai.chat'),
              userPrompt: '根据检索结果回答：{{trigger.content}}\n\n检索片段：{{steps.__last__.chunks}}',
            },
            position: { x: 520, y: 140 },
          },
        ],
        edges: [
          { id: `e-${t}-${k}`, source: t, target: k },
          { id: `e-${k}-${a}`, source: k, target: a },
        ],
      }
    },
  },
  {
    id: 'daily-feishu-report',
    name: '每日飞书日报',
    description: '每天 9:00 拉数据 → AI 汇总 → 发飞书群',
    build: () => {
      const t = nid()
      const h = nid()
      const a = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.cron', label: '每天 9:00', config: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' }, position: { x: 60, y: 160 } },
          { id: h, type: 'http.request', label: '拉取业务数据', config: { ...defaultNodeConfig('http.request'), url: 'https://你的系统/api/daily-stats', method: 'GET' }, position: { x: 280, y: 160 } },
          { id: a, type: 'ai.chat', label: 'AI 汇总日报', config: { systemPrompt: '把 JSON 数据整理成简洁的中文日报', userPrompt: '统计时间：{{trigger.firedAt}}\n\n原始数据：\n{{steps.' + h + '.body}}' }, position: { x: 500, y: 160 } },
          { id: s, type: 'channel.send', label: '发飞书群', config: { channel: 'feishu', receiveId: '', content: '📊 每日运营汇总（{{trigger.firedAt}}）\n\n{{steps.__last__.text}}' }, position: { x: 720, y: 160 } },
        ],
        edges: [
          { id: `e-${t}-${h}`, source: t, target: h },
          { id: `e-${h}-${a}`, source: h, target: a },
          { id: `e-${a}-${s}`, source: a, target: s },
        ],
      }
    },
  },
  {
    id: 'daily-dingtalk-report',
    name: '每日钉钉日报',
    description: '每天 9:00 拉数据 → AI 汇总 → 钉钉消息',
    build: () => {
      const t = nid()
      const h = nid()
      const a = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.cron', label: '每天 9:00', config: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' }, position: { x: 60, y: 160 } },
          { id: h, type: 'http.request', label: '拉取业务数据', config: { ...defaultNodeConfig('http.request'), url: 'https://你的系统/api/daily-stats', method: 'GET' }, position: { x: 280, y: 160 } },
          { id: a, type: 'ai.chat', label: 'AI 汇总', config: { systemPrompt: '把 JSON 数据整理成简洁的中文日报', userPrompt: '统计时间：{{trigger.firedAt}}\n\n原始数据：\n{{steps.' + h + '.body}}' }, position: { x: 500, y: 160 } },
          { id: s, type: 'channel.send', label: '发钉钉消息', config: { channel: 'dingtalk', userIdList: '{{trigger.fromId}}', content: '📊 日报\n\n{{steps.__last__.text}}' }, position: { x: 720, y: 160 } },
        ],
        edges: [
          { id: `e-${t}-${h}`, source: t, target: h },
          { id: `e-${h}-${a}`, source: h, target: a },
          { id: `e-${a}-${s}`, source: a, target: s },
        ],
      }
    },
  },
  {
    id: 'wecom-daily-report',
    name: '每日企微日报',
    description: '定时拉取 → AI 分析 → 企微推送',
    build: () => {
      const t = nid()
      const h = nid()
      const a = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.cron', label: '每天 9:00', config: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' }, position: { x: 60, y: 160 } },
          { id: h, type: 'http.request', label: '拉取业务数据', config: { ...defaultNodeConfig('http.request'), url: 'https://你的系统/api/stats', method: 'GET' }, position: { x: 280, y: 160 } },
          { id: a, type: 'ai.chat', label: 'AI 分析', config: { systemPrompt: '分析业务数据给出运营建议', userPrompt: '数据：{{steps.' + h + '.body}}' }, position: { x: 500, y: 160 } },
          { id: s, type: 'channel.send', label: '发企微消息', config: { channel: 'wecom', toUser: '', content: '📋 日报\n\n{{steps.__last__.text}}' }, position: { x: 720, y: 160 } },
        ],
        edges: [
          { id: `e-${t}-${h}`, source: t, target: h },
          { id: `e-${h}-${a}`, source: h, target: a },
          { id: `e-${a}-${s}`, source: a, target: s },
        ],
      }
    },
  },
  {
    id: 'webhook-alert',
    name: 'Webhook 告警',
    description: 'Webhook → 条件判断 → 推送消息',
    build: () => {
      const t = nid()
      const i = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.webhook', label: 'Webhook', config: defaultNodeConfig('trigger.webhook'), position: { x: 60, y: 160 } },
          { id: i, type: 'logic.if', label: '含告警?', config: defaultNodeConfig('logic.if'), position: { x: 300, y: 160 } },
          { id: s, type: 'channel.send', label: '推送告警', config: defaultNodeConfig('channel.send'), position: { x: 560, y: 100 } },
        ],
        edges: [
          { id: `e-${t}-${i}`, source: t, target: i },
          { id: `e-${i}-${s}`, source: i, target: s, sourceHandle: 'true' },
        ],
      }
    },
  },
  {
    id: 'ai-agent-kb',
    name: 'AI Agent 智能体',
    description: '对话触发 → AI Agent（知识库+HTTP工具）',
    build: () => {
      const t = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.chat', label: '对话触发', config: {}, position: { x: 60, y: 160 } },
          { id: a, type: 'ai.agent', label: 'AI Agent', config: defaultNodeConfig('ai.agent'), position: { x: 300, y: 160 } },
        ],
        edges: [{ id: `e-${t}-${a}`, source: t, target: a }],
      }
    },
  },
  {
    id: 'webhook-dingtalk',
    name: 'Webhook → 钉钉告警',
    description: '外部系统触发的钉钉告警推送',
    build: () => {
      const t = nid()
      const i = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.webhook', label: 'Webhook', config: defaultNodeConfig('trigger.webhook'), position: { x: 60, y: 160 } },
          { id: i, type: 'logic.if', label: '含告警?', config: defaultNodeConfig('logic.if'), position: { x: 260, y: 160 } },
          { id: s, type: 'channel.send', label: '推送钉钉', config: { channel: 'dingtalk', userIdList: '', content: '⚠️ 告警：{{trigger.content}}' }, position: { x: 500, y: 100 } },
        ],
        edges: [
          { id: `e-${t}-${i}`, source: t, target: i },
          { id: `e-${i}-${s}`, source: i, target: s, sourceHandle: 'true' },
        ],
      }
    },
  },
  {
    id: 'http-transform',
    name: 'HTTP 数据加工',
    description: 'Webhook → 数据转换 → HTTP 转发',
    build: () => {
      const t = nid()
      const c = nid()
      const h = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.webhook', label: 'Webhook', config: defaultNodeConfig('trigger.webhook'), position: { x: 60, y: 120 } },
          { id: c, type: 'logic.code', label: '数据转换', config: defaultNodeConfig('logic.code'), position: { x: 280, y: 120 } },
          { id: h, type: 'http.request', label: '转发数据', config: { ...defaultNodeConfig('http.request'), method: 'POST' }, position: { x: 520, y: 120 } },
        ],
        edges: [
          { id: `e-${t}-${c}`, source: t, target: c },
          { id: `e-${c}-${h}`, source: c, target: h },
        ],
      }
    },
  },
  {
    id: 'cron-check',
    name: '定时巡检',
    description: '定时检查 → IF 条件 → 通知结果',
    build: () => {
      const t = nid()
      const h = nid()
      const i = nid()
      const s_ok = nid()
      const s_ng = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.cron', label: '每 30 分钟', config: { cron: '*/30 * * * *', timezone: 'Asia/Shanghai' }, position: { x: 60, y: 180 } },
          { id: h, type: 'http.request', label: '巡检接口', config: { ...defaultNodeConfig('http.request'), url: 'https://你的系统/health', method: 'GET' }, position: { x: 250, y: 180 } },
          { id: i, type: 'logic.if', label: '是否正常?', config: { left: '{{steps.' + h + '.status}}', operator: '==', right: '200' }, position: { x: 460, y: 180 } },
          { id: s_ok, type: 'channel.send', label: '推送正常', config: { channel: 'dingtalk', userIdList: '', content: '✅ 巡检正常' }, position: { x: 660, y: 110 } },
          { id: s_ng, type: 'channel.send', label: '推送异常', config: { channel: 'wecom', toUser: '', content: '❌ 巡检异常：{{steps.' + h + '.body}}' }, position: { x: 660, y: 250 } },
        ],
        edges: [
          { id: `e-${t}-${h}`, source: t, target: h },
          { id: `e-${h}-${i}`, source: h, target: i },
          { id: `e-${i}-${s_ok}`, source: i, target: s_ok, sourceHandle: 'true' },
          { id: `e-${i}-${s_ng}`, source: i, target: s_ng, sourceHandle: 'false' },
        ],
      }
    },
  },
  {
    id: 'chat-customer-service',
    name: '客服对话机器人',
    description: '对话触发 → 知识库 → AI → 回复',
    build: () => {
      const t = nid()
      const k = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.chat', label: '对话触发', config: {}, position: { x: 60, y: 140 } },
          { id: k, type: 'ai.knowledge', label: '知识库检索', config: defaultNodeConfig('ai.knowledge'), position: { x: 260, y: 140 } },
          { id: a, type: 'ai.chat', label: 'AI 回答', config: { systemPrompt: '你是客服助手，根据知识库回答', userPrompt: '用户：{{trigger.content}}\n\n相关文档：{{steps.__last__.chunks}}' }, position: { x: 480, y: 140 } },
        ],
        edges: [
          { id: `e-${t}-${k}`, source: t, target: k },
          { id: `e-${k}-${a}`, source: k, target: a },
        ],
      }
    },
  },
]
