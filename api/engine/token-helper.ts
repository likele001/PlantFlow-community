import { db, type WecomChannelConfig, type FeishuChannelConfig, type DingtalkChannelConfig } from '../store.js'

export async function getWecomToken(tenantId: string, cfg: Pick<WecomChannelConfig, 'corpId' | 'secret'>): Promise<string> {
  const cached = db.wecomAccessTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.secret)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; errmsg?: string } | null
  if (!data?.access_token) throw new Error(data?.errmsg ?? '获取企业微信 token 失败')
  const ttl = typeof data.expires_in === 'number' ? data.expires_in : 7200
  db.wecomAccessTokenCache.set(tenantId, { token: data.access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.access_token
}

export async function getFeishuToken(tenantId: string, cfg: Pick<FeishuChannelConfig, 'appId' | 'appSecret'>): Promise<string> {
  const cached = db.feishuTenantTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  })
  const data = (await res.json().catch(() => null)) as { tenant_access_token?: string; expire?: number; code?: number; msg?: string } | null
  if (!data?.tenant_access_token) throw new Error(data?.msg ?? '获取飞书 token 失败')
  const ttl = typeof data.expire === 'number' ? data.expire : 7200
  db.feishuTenantTokenCache.set(tenantId, { token: data.tenant_access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.tenant_access_token
}
