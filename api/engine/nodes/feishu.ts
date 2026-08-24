/**
 * 飞书增强功能节点
 */
import { db } from '../../store.js'
import { renderTemplate } from '../template.js'
import { getFeishuToken } from '../token-helper.js'
import type { NodeExecutor } from './registry.js'

/**
 * 飞书获取部门列表
 */
export const feishuListDepartments: NodeExecutor = {
  type: 'feishu.listDepartments',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const departmentId = renderTemplate(String(cfg.departmentId ?? '0'), ctx)
    const fetchChild = cfg.fetchChild !== false
    const chCfg = (await db.getChannelConfig(tenantId))?.feishu
    if (!chCfg) throw new Error('飞书未配置')
    const token = await getFeishuToken(tenantId, chCfg)
    const url = `https://open.feishu.cn/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}/children?fetch_child=${fetchChild ? true : false}`
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await r.json().catch(() => null)) as { code?: number; msg?: string; data?: { items?: unknown[] } } | null
    if (data?.code !== 0) throw new Error(data?.msg ?? '获取部门列表失败')
    return { departments: data?.data?.items ?? [] }
  },
}

/**
 * 飞书获取用户列表
 */
export const feishuListUsers: NodeExecutor = {
  type: 'feishu.listUsers',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const departmentId = renderTemplate(String(cfg.departmentId ?? ''), ctx)
    const chCfg = (await db.getChannelConfig(tenantId))?.feishu
    if (!chCfg) throw new Error('飞书未配置')
    const token = await getFeishuToken(tenantId, chCfg)
    let url = 'https://open.feishu.cn/open-apis/contact/v3/users'
    if (departmentId) {
      url += `?department_id=${encodeURIComponent(departmentId)}`
    }
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await r.json().catch(() => null)) as { code?: number; msg?: string; data?: { items?: unknown[] } } | null
    if (data?.code !== 0) throw new Error(data?.msg ?? '获取用户列表失败')
    return { users: data?.data?.items ?? [] }
  },
}

/**
 * 飞书创建多维表格记录
 */
export const feishuCreateRecord: NodeExecutor = {
  type: 'feishu.createRecord',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const appToken = renderTemplate(String(cfg.appToken ?? ''), ctx)
    const tableId = renderTemplate(String(cfg.tableId ?? ''), ctx)
    const fields = cfg.fields as Record<string, unknown>
    const chCfg = (await db.getChannelConfig(tenantId))?.feishu
    if (!chCfg) throw new Error('飞书未配置')
    if (!appToken || !tableId) throw new Error('缺少 appToken 或 tableId')
    const token = await getFeishuToken(tenantId, chCfg)
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, renderTemplate(String(v), ctx)])
        ),
      }),
    })
    const data = (await r.json().catch(() => null)) as { code?: number; msg?: string; data?: unknown } | null
    if (data?.code !== 0) throw new Error(data?.msg ?? '创建记录失败')
    return { record: data?.data }
  },
}

/**
 * 飞书创建日程
 */
export const feishuCreateEvent: NodeExecutor = {
  type: 'feishu.createEvent',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const summary = renderTemplate(String(cfg.summary ?? ''), ctx)
    const description = renderTemplate(String(cfg.description ?? ''), ctx)
    const startTime = renderTemplate(String(cfg.startTime ?? ''), ctx)
    const endTime = renderTemplate(String(cfg.endTime ?? ''), ctx)
    const attendeeUserIds = (cfg.attendeeUserIds ?? []) as string[]
    const chCfg = (await db.getChannelConfig(tenantId))?.feishu
    if (!chCfg) throw new Error('飞书未配置')
    if (!summary || !startTime || !endTime) throw new Error('缺少必要参数')
    const token = await getFeishuToken(tenantId, chCfg)
    const url = 'https://open.feishu.cn/open-apis/calendar/v4/events'
    const r = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        summary,
        description,
        start_time: { timestamp: startTime },
        end_time: { timestamp: endTime },
        attendees: attendeeUserIds.map(uid => ({ user_id: uid })),
      }),
    })
    const data = (await r.json().catch(() => null)) as { code?: number; msg?: string; data?: unknown } | null
    if (data?.code !== 0) throw new Error(data?.msg ?? '创建日程失败')
    return { event: data?.data }
  },
}
