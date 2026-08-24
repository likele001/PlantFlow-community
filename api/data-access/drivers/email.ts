// api/data-access/drivers/email.ts
// N4.6 邮件连接器（SMTP 发送 / 连接测试）
import type { DataSourceDriver, QueryResult } from '../types.js'
import type { DataSource } from '../../store.js'
import nodemailer from 'nodemailer'

type EmailCfg = { host?: string; port?: number; secure?: boolean; from?: string }
type EmailSecret = { user?: string; pass?: string }

export const emailDriver: DataSourceDriver = {
  kind: 'email',
  async test({ source, secret }) {
    const cfg = source.config as EmailCfg
    if (!cfg.host) throw new Error('缺少 host')
    const t = nodemailer.createTransport({
      host: String(cfg.host),
      port: Number(cfg.port ?? 587),
      secure: Boolean(cfg.secure ?? false),
      auth: { user: String(secret.user ?? ''), pass: String(secret.pass ?? '') },
    })
    await t.verify()
  },
  async query({ source, secret, sqlOrReq }): Promise<QueryResult> {
    const start = Date.now()
    const cfg = source.config as EmailCfg
    let req: { op?: string; to?: string; subject?: string; text?: string; html?: string }
    try { req = JSON.parse(sqlOrReq) } catch { throw new Error('email 查询体需为 JSON { op:"send", to, subject, text }') }
    if ((req.op ?? 'send') !== 'send') throw new Error('当前仅支持 op:"send" 发送邮件')
    if (!req.to) throw new Error('缺少 to')
    const t = nodemailer.createTransport({
      host: String(cfg.host),
      port: Number(cfg.port ?? 587),
      secure: Boolean(cfg.secure ?? false),
      auth: { user: String(secret.user ?? ''), pass: String(secret.pass ?? '') },
    })
    const info = await t.sendMail({
      from: cfg.from ? String(cfg.from) : String(secret.user ?? ''),
      to: String(req.to),
      subject: req.subject ?? '',
      text: req.text,
      html: req.html,
    })
    const rows = [{ accepted: Array.isArray(info.accepted) ? info.accepted.join(',') : String(info.accepted), messageId: info.messageId }]
    return { columns: Object.keys(rows[0]), rows, rowCount: rows.length, durationMs: Date.now() - start }
  },
}
