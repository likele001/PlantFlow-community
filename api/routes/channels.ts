import crypto from 'crypto'
import express, { Router, type Request, type Response } from 'express'
import { db, type FeishuChannelConfig, type WecomChannelConfig, type DingtalkChannelConfig } from '../store.js'
import { handleBotMessage } from './bot-engine.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import * as dingtalkClient from '../plugins/dingtalk/client.js'

type WecomIncoming = {
  conversationExternalId: string
  kind: 'group' | 'direct'
  fromId: string
  content: string
  raw?: unknown
}

function sha1(input: string) {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex')
}

function pkcs7Unpad(buf: Buffer) {
  const pad = buf[buf.length - 1]
  if (!pad || pad > 32) return buf
  return buf.subarray(0, buf.length - pad)
}

function pkcs7Pad(buf: Buffer) {
  const block = 32
  const pad = block - (buf.length % block || block)
  const padding = Buffer.alloc(pad, pad)
  return Buffer.concat([buf, padding])
}

function wecomAesKey(encodingAESKey: string) {
  const fixed = encodingAESKey.trim().endsWith('=') ? encodingAESKey.trim() : encodingAESKey.trim() + '='
  return Buffer.from(fixed, 'base64')
}

function wecomDecrypt(encodingAESKey: string, encrypt: string) {
  const key = wecomAesKey(encodingAESKey)
  const iv = key.subarray(0, 16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  decipher.setAutoPadding(false)
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()])
  const unpadded = pkcs7Unpad(plain)
  const msgLen = unpadded.readUInt32BE(16)
  const xml = unpadded.subarray(20, 20 + msgLen).toString('utf8')
  const corpId = unpadded.subarray(20 + msgLen).toString('utf8')
  return { xml, corpId }
}

function wecomEncrypt(encodingAESKey: string, corpId: string, xml: string) {
  const key = wecomAesKey(encodingAESKey)
  const iv = key.subarray(0, 16)
  const random16 = crypto.randomBytes(16)
  const msg = Buffer.from(xml, 'utf8')
  const msgLen = Buffer.alloc(4)
  msgLen.writeUInt32BE(msg.length, 0)
  const corp = Buffer.from(corpId, 'utf8')
  const raw = Buffer.concat([random16, msgLen, msg, corp])
  const padded = pkcs7Pad(raw)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
  return encrypted
}

function wecomSignature(token: string, timestamp: string, nonce: string, encrypt: string) {
  const arr = [token, timestamp, nonce, encrypt].sort()
  return sha1(arr.join(''))
}

function xmlTag(xml: string, tag: string) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const m = xml.match(re)
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

function maskSecret(val: string | undefined | null): string {
  if (!val) return val ?? ''
  if (val.length <= 4) return '****'
  return val.slice(0, 2) + '****' + val.slice(-2)
}

export async function getWecomAccessToken(tenantId: string, cfg: WecomChannelConfig) {
  const cached = db.wecomAccessTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.secret)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string } | null
  if (!data?.access_token) {
    throw new Error(data?.errmsg ?? 'Failed to get wecom access token')
  }
  const ttl = typeof data.expires_in === 'number' ? data.expires_in : 7200
  db.wecomAccessTokenCache.set(tenantId, { token: data.access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.access_token
}

export async function getFeishuTenantToken(tenantId: string, cfg: FeishuChannelConfig) {
  const cached = db.feishuTenantTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  })
  const data = (await res.json().catch(() => null)) as { tenant_access_token?: string; expire?: number; code?: number; msg?: string } | null
  if (!data?.tenant_access_token) {
    throw new Error(data?.msg ?? 'Failed to get feishu tenant token')
  }
  const ttl = typeof data.expire === 'number' ? data.expire : 7200
  db.feishuTenantTokenCache.set(tenantId, { token: data.tenant_access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.tenant_access_token
}

export async function getDingtalkAccessToken(tenantId: string, cfg: DingtalkChannelConfig) {
  const cached = db.dingtalkAccessTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(cfg.appKey)}&appsecret=${encodeURIComponent(cfg.appSecret)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string } | null
  if (!data?.access_token) {
    throw new Error(data?.errmsg ?? 'Failed to get dingtalk access token')
  }
  const ttl = typeof data.expires_in === 'number' ? data.expires_in : 7200
  db.dingtalkAccessTokenCache.set(tenantId, { token: data.access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.access_token
}

const router = Router()

router.get('/wecom/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.wecom ?? null
  if (cfg) {
    cfg.secret = maskSecret(cfg.secret)
    cfg.token = maskSecret(cfg.token)
    cfg.encodingAESKey = maskSecret(cfg.encodingAESKey)
  }
  res.status(200).json({ success: true, data: cfg })
})

router.post('/wecom/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<WecomChannelConfig>
  const next: WecomChannelConfig = {
    corpId: String(body.corpId ?? '').trim(),
    agentId: String(body.agentId ?? '').trim(),
    secret: String(body.secret ?? '').trim(),
    token: String(body.token ?? '').trim(),
    encodingAESKey: String(body.encodingAESKey ?? '').trim(),
  }
  if (!next.corpId || !next.agentId || !next.secret || !next.token || !next.encodingAESKey) {
    res.status(400).json({ success: false, error: 'Missing wecom config fields' })
    return
  }
  await db.upsertWecomConfig(tenantId, next)
  db.wecomAccessTokenCache.delete(tenantId)
  res.status(200).json({ success: true, data: next })
})

router.get('/feishu/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.feishu ?? null
  if (cfg) {
    cfg.appSecret = maskSecret(cfg.appSecret)
    cfg.verificationToken = maskSecret(cfg.verificationToken)
    cfg.encryptKey = maskSecret(cfg.encryptKey)
  }
  res.status(200).json({ success: true, data: cfg })
})

router.post('/feishu/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<FeishuChannelConfig>
  const next: FeishuChannelConfig = {
    appId: String(body.appId ?? '').trim(),
    appSecret: String(body.appSecret ?? '').trim(),
    verificationToken: String(body.verificationToken ?? '').trim(),
    encryptKey: String(body.encryptKey ?? '').trim(),
  }
  if (!next.appId || !next.appSecret || !next.verificationToken || !next.encryptKey) {
    res.status(400).json({ success: false, error: 'Missing feishu config fields' })
    return
  }
  await db.upsertFeishuConfig(tenantId, next)
  db.feishuTenantTokenCache.delete(tenantId)
  res.status(200).json({ success: true, data: next })
})

router.post('/wecom/send', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.wecom
  if (!cfg) {
    res.status(400).json({ success: false, error: 'WeCom not configured' })
    return
  }
  const { toUser, toParty, toTag, content } = (req.body ?? {}) as {
    toUser?: string
    toParty?: string
    toTag?: string
    content?: string
  }
  const text = String(content ?? '').trim()
  if (!text) {
    res.status(400).json({ success: false, error: 'Missing content' })
    return
  }
  const accessToken = await getWecomAccessToken(tenantId, cfg)
  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`
  const payload = {
    touser: String(toUser ?? '').trim() || undefined,
    toparty: String(toParty ?? '').trim() || undefined,
    totag: String(toTag ?? '').trim() || undefined,
    msgtype: 'text',
    agentid: cfg.agentId,
    text: { content: text },
    safe: 0,
  }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = (await r.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null
  if (data?.errcode !== 0) {
    res.status(502).json({ success: false, error: data?.errmsg ?? 'WeCom send failed' })
    return
  }
  res.status(200).json({ success: true, data: true })
})

router.post('/feishu/send', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.feishu
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Feishu not configured' })
    return
  }
  const { receiveIdType, receiveId, content } = (req.body ?? {}) as {
    receiveIdType?: 'chat_id' | 'open_id'
    receiveId?: string
    content?: string
  }
  const rid = String(receiveId ?? '').trim()
  const text = String(content ?? '').trim()
  const type = receiveIdType === 'open_id' ? 'open_id' : 'chat_id'
  if (!rid || !text) {
    res.status(400).json({ success: false, error: 'Missing receiveId or content' })
    return
  }
  const token = await getFeishuTenantToken(tenantId, cfg)
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(type)}`
  const payload = {
    receive_id: rid,
    msg_type: 'text',
    content: JSON.stringify({ text }),
  }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
  const data = (await r.json().catch(() => null)) as { code?: number; msg?: string } | null
  if ((data?.code ?? 0) !== 0) {
    res.status(502).json({ success: false, error: data?.msg ?? 'Feishu send failed' })
    return
  }
  res.status(200).json({ success: true, data: true })
})

router.get('/wecom/webhook/:tenantId', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const cfg = (await db.getChannelConfig(tenantId))?.wecom
  if (!cfg) {
    res.status(404).send('not configured')
    return
  }

  const msgSignature = String(req.query.msg_signature ?? '')
  const timestamp = String(req.query.timestamp ?? '')
  const nonce = String(req.query.nonce ?? '')
  const echostr = String(req.query.echostr ?? '')
  if (!msgSignature || !timestamp || !nonce || !echostr) {
    res.status(400).send('bad request')
    return
  }

  const sig = wecomSignature(cfg.token, timestamp, nonce, echostr)
  if (sig !== msgSignature) {
    res.status(401).send('invalid signature')
    return
  }

  const decrypted = wecomDecrypt(cfg.encodingAESKey, echostr)
  res.status(200).send(decrypted.xml)

})
router.post('/wecom/webhook/:tenantId', express.text({ type: '*/*' }), async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const cfg = (await db.getChannelConfig(tenantId))?.wecom
  if (!cfg) {
    res.status(404).send('not configured')
    return
  }

  const msgSignature = String(req.query.msg_signature ?? '')
  const timestamp = String(req.query.timestamp ?? '')
  const nonce = String(req.query.nonce ?? '')
  if (!msgSignature || !timestamp || !nonce) {
    res.status(400).send('bad request')
    return
  }

  const bodyXml = String(req.body ?? '')
  const encrypt = xmlTag(bodyXml, 'Encrypt')
  if (!encrypt) {
    res.status(400).send('bad request')
    return
  }

  const sig = wecomSignature(cfg.token, timestamp, nonce, encrypt)
  if (sig !== msgSignature) {
    res.status(401).send('invalid signature')
    return
  }

  const { xml } = wecomDecrypt(cfg.encodingAESKey, encrypt)
  const msgType = xmlTag(xml, 'MsgType')
  const content = msgType === 'text' ? xmlTag(xml, 'Content') : ''
  const fromUser = xmlTag(xml, 'FromUserName')
  const roomId = xmlTag(xml, 'ChatId')
  const kind = roomId ? 'group' : 'direct'
  const conversationExternalId = roomId ? `wecom:chat:${roomId}` : `wecom:user:${fromUser}`
  const title = roomId ? `企业微信群(${roomId})` : `企业微信私聊(${fromUser})`

  const normalized: WecomIncoming = {
    conversationExternalId,
    kind,
    fromId: fromUser,
    content: content || `[${msgType}]`,
    raw: xml,
  }

  const conv = await db.upsertConversation(tenantId, 'wecom', normalized.conversationExternalId, normalized.kind, title)
  await db.insertMessage(tenantId, conv.id, 'in', normalized.fromId, normalized.content, normalized.raw)

  // Bot 对话引擎处理
  void handleBotMessage(tenantId, 'wecom', fromUser || normalized.fromId, content || '').catch((e) => console.error('[bot] wecom error', e))

  const { triggerMatchingWorkflows } = await import('../engine/executor.js')
  void triggerMatchingWorkflows(tenantId, 'trigger.wecom', {
    channel: 'wecom',
    conversationId: conv.id,
    conversationExternalId: normalized.conversationExternalId,
    kind: normalized.kind,
    fromId: normalized.fromId,
    content: normalized.content,
    chatId: roomId || undefined,
  }).catch((e) => console.error('[wecom] workflow trigger failed', e))

  res.status(200).send('success')
})

router.post('/feishu/webhook/:tenantId', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const cfg = (await db.getChannelConfig(tenantId))?.feishu
  if (!cfg) {
    res.status(404).json({ code: 404, msg: 'not configured' })
    return
  }

  const body = (req.body ?? {}) as any
  if (body?.type === 'url_verification' && typeof body?.challenge === 'string') {
    res.status(200).json({ challenge: body.challenge })
    return
  }

  const headerToken = String(body?.header?.token ?? '')
  if (headerToken !== cfg.verificationToken) {
    res.status(401).json({ code: 401, msg: 'invalid token' })
    return
  }

  const eventType = String(body?.header?.event_type ?? '')
  if (!eventType) {
    res.status(200).json({ code: 0, msg: 'ok' })
    return
  }

  if (eventType === 'im.message.receive_v1') {
    const msg = body?.event?.message
    const sender = body?.event?.sender
    const chatId = String(msg?.chat_id ?? '')
    const chatType = String(msg?.chat_type ?? '')
    const contentRaw = String(msg?.content ?? '')
    let contentText = ''
    try {
      const parsed = JSON.parse(contentRaw) as any
      contentText = String(parsed?.text ?? '')
    } catch {
      contentText = contentRaw
    }

    const kind: 'group' | 'direct' = chatType === 'p2p' ? 'direct' : 'group'
    const conversationExternalId = `feishu:chat:${chatId}`
    const fromId = String(sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? '')
    const title = kind === 'direct' ? `飞书私聊(${chatId})` : `飞书群(${chatId})`
    const conv = await db.upsertConversation(tenantId, 'feishu', conversationExternalId, kind, title)
    await db.insertMessage(tenantId, conv.id, 'in', fromId || 'unknown', contentText || '[message]', body)

    // Bot 对话引擎处理
    void handleBotMessage(tenantId, 'feishu', fromId || 'unknown', contentText || '').catch((e) => console.error('[bot] feishu error', e))

    const { triggerMatchingWorkflows } = await import('../engine/executor.js')
    void triggerMatchingWorkflows(tenantId, 'trigger.feishu', {
      channel: 'feishu',
      conversationId: conv.id,
      conversationExternalId,
      kind,
      fromId,
      content: contentText,
      chatId,
    }).catch((e) => console.error('[feishu] workflow trigger failed', e))
  }

  res.status(200).json({ code: 0, msg: 'ok' })
})

// ========== DingTalk ==========

router.get('/dingtalk/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.dingtalk ?? null
  if (cfg) {
    cfg.appSecret = maskSecret(cfg.appSecret)
    if (cfg.token) cfg.token = maskSecret(cfg.token)
    if (cfg.encodingAESKey) cfg.encodingAESKey = maskSecret(cfg.encodingAESKey)
  }
  res.status(200).json({ success: true, data: cfg })
})

router.post('/dingtalk/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<DingtalkChannelConfig>
  const next: DingtalkChannelConfig = {
    appKey: String(body.appKey ?? '').trim(),
    appSecret: String(body.appSecret ?? '').trim(),
    agentId: body.agentId ? Number(body.agentId) : undefined,
    token: body.token ? String(body.token).trim() : undefined,
    encodingAESKey: body.encodingAESKey ? String(body.encodingAESKey).trim() : undefined,
  }
  if (!next.appKey || !next.appSecret) {
    res.status(400).json({ success: false, error: 'Missing dingtalk config fields (appKey, appSecret)' })
    return
  }
  await db.upsertDingtalkConfig(tenantId, next)
  db.dingtalkAccessTokenCache.delete(tenantId)
  res.status(200).json({ success: true, data: next })
})

router.post('/dingtalk/send', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = (await db.getChannelConfig(tenantId))?.dingtalk
  if (!cfg) {
    res.status(400).json({ success: false, error: 'DingTalk not configured' })
    return
  }
  if (!cfg.agentId) {
    res.status(400).json({ success: false, error: 'DingTalk agentId not configured' })
    return
  }
  const { userIdList, content } = (req.body ?? {}) as {
    userIdList?: string[] | string
    content?: string
  }
  const userIds = Array.isArray(userIdList) ? userIdList : userIdList ? String(userIdList).split(',') : []
  const text = String(content ?? '').trim()
  if (!userIds.length || !text) {
    res.status(400).json({ success: false, error: 'Missing userIdList or content' })
    return
  }
  try {
    await dingtalkClient.sendTextMessage(cfg, userIds, text)
    res.status(200).json({ success: true, data: true })
  } catch (e) {
    res.status(502).json({ success: false, error: (e as Error).message })
  }
})

router.post('/dingtalk/webhook/:tenantId', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const cfg = (await db.getChannelConfig(tenantId))?.dingtalk
  if (!cfg) {
    res.status(404).json({ errcode: 404, errmsg: 'not configured' })
    return
  }

  let body = (req.body ?? {}) as any

  // URL 验证
  if (body?.type === 'check_url') {
    res.status(200).json({ errcode: 0, errmsg: 'ok' })
    return
  }

  // 验证签名（如果配置了）
  if (cfg.token) {
    const signature = String(req.query.signature ?? '')
    const timestamp = String(req.query.timestamp ?? '')
    const nonce = String(req.query.nonce ?? '')
    if (signature && timestamp && nonce) {
      const bodyStr = JSON.stringify(body)
      const valid = dingtalkClient.verifyCallbackSignature(
        signature,
        timestamp,
        nonce,
        bodyStr,
        cfg.token
      )
      if (!valid) {
        res.status(401).json({ errcode: 401, errmsg: 'invalid signature' })
        return
      }
    }
  }

  // 解密加密回调（钉钉在 encrypt 字段中传递加密数据）
  if (body?.encrypt && cfg.encodingAESKey) {
    try {
      const decrypted = dingtalkClient.decryptCallbackData(body.encrypt, cfg.encodingAESKey)
      const parsed = JSON.parse(decrypted.msg) as Record<string, unknown>
      body = parsed
    } catch (e) {
      console.error('[dingtalk] decrypt failed', e)
      res.status(200).json({ errcode: 0, errmsg: 'ok' })
      return
    }
  }

  const eventType = String(body?.EventType ?? '')
  if (eventType === 'bpms_instance_change' || eventType === 'bpms_task_change') {
    // 审批事件
    res.status(200).json({ errcode: 0, errmsg: 'ok' })
    return
  }

  if (body?.conversationType || body?.sender) {
    // 消息事件
    const conversationType = String(body?.conversationType ?? '')
    const chatId = String(body?.chatbotCorpId ?? body?.conversationId ?? '')
    const senderId = String(body?.sender?.senderId ?? body?.senderStaffId ?? '')
    const contentRaw = String(body?.text?.content ?? body?.content ?? '')
    const kind: 'group' | 'direct' = conversationType === '2' ? 'group' : 'direct'
    const conversationExternalId = `dingtalk:chat:${chatId}`
    const title = kind === 'direct' ? `钉钉私聊(${senderId})` : `钉钉群(${chatId})`
    
    const conv = await db.upsertConversation(tenantId, 'dingtalk', conversationExternalId, kind, title)
    await db.insertMessage(tenantId, conv.id, 'in', senderId || 'unknown', contentRaw || '[message]', body)

    // Bot 对话引擎处理
    void handleBotMessage(tenantId, 'dingtalk', senderId || 'unknown', contentRaw || '').catch((e) => console.error('[bot] dingtalk error', e))

    const { triggerMatchingWorkflows } = await import('../engine/executor.js')
    void triggerMatchingWorkflows(tenantId, 'trigger.dingtalk', {
      channel: 'dingtalk',
      conversationId: conv.id,
      conversationExternalId,
      kind,
      fromId: senderId,
      content: contentRaw,
      chatId,
    }).catch((e) => console.error('[dingtalk] workflow trigger failed', e))
  }

  res.status(200).json({ errcode: 0, errmsg: 'ok' })
})

export default router
