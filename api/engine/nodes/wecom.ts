/**
 * 企业微信增强功能节点
 */
import { db } from '../../store.js'
import { renderTemplate } from '../template.js'
import { getWecomToken } from '../token-helper.js'
import type { NodeExecutor } from './registry.js'

/**
 * 企业微信获取部门列表
 */
export const wecomListDepartments: NodeExecutor = {
  type: 'wecom.listDepartments',
  async execute({ tenantId, ctx }) {
    const chCfg = (await db.getChannelConfig(tenantId))?.wecom
    if (!chCfg) throw new Error('企业微信未配置')
    const accessToken = await getWecomToken(tenantId, chCfg)
    const url = `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${encodeURIComponent(accessToken)}`
    const r = await fetch(url)
    const data = (await r.json().catch(() => null)) as { errcode?: number; errmsg?: string; department?: unknown[] } | null
    if (data?.errcode !== 0) throw new Error(data?.errmsg ?? '获取部门列表失败')
    return { departments: data?.department ?? [] }
  },
}

/**
 * 企业微信获取部门成员
 */
export const wecomListUsers: NodeExecutor = {
  type: 'wecom.listUsers',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const departmentId = Number(renderTemplate(String(cfg.departmentId ?? '1'), ctx))
    const fetchChild = cfg.fetchChild !== false
    const chCfg = (await db.getChannelConfig(tenantId))?.wecom
    if (!chCfg) throw new Error('企业微信未配置')
    const accessToken = await getWecomToken(tenantId, chCfg)
    const url = `https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${encodeURIComponent(accessToken)}&department_id=${departmentId}&fetch_child=${fetchChild ? 1 : 0}`
    const r = await fetch(url)
    const data = (await r.json().catch(() => null)) as { errcode?: number; errmsg?: string; userlist?: unknown[] } | null
    if (data?.errcode !== 0) throw new Error(data?.errmsg ?? '获取成员列表失败')
    return { users: data?.userlist ?? [] }
  },
}

/**
 * 企业微信发送图文消息
 */
export const wecomSendNews: NodeExecutor = {
  type: 'wecom.sendNews',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const toUser = renderTemplate(String(cfg.toUser ?? ''), ctx)
    const toParty = renderTemplate(String(cfg.toParty ?? ''), ctx)
    const toTag = renderTemplate(String(cfg.toTag ?? ''), ctx)
    const articles = (cfg.articles ?? []) as Array<{ title: string; description?: string; url: string; picurl?: string }>
    const chCfg = (await db.getChannelConfig(tenantId))?.wecom
    if (!chCfg) throw new Error('企业微信未配置')
    const accessToken = await getWecomToken(tenantId, chCfg)
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: toUser || undefined,
        toparty: toParty || undefined,
        totag: toTag || undefined,
        msgtype: 'news',
        agentid: chCfg.agentId,
        news: {
          articles: articles.map(a => ({
            title: renderTemplate(String(a.title), ctx),
            description: a.description ? renderTemplate(String(a.description), ctx) : undefined,
            url: renderTemplate(String(a.url), ctx),
            picurl: a.picurl ? renderTemplate(String(a.picurl), ctx) : undefined,
          })),
        },
      }),
    })
    const data = (await r.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null
    if (data?.errcode !== 0) throw new Error(data?.errmsg ?? '发送图文消息失败')
    return { sent: true }
  },
}
