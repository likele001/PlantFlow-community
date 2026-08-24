/**
 * 淘宝客服消息路由
 * - GET/POST /taobao/config — 淘宝渠道配置 CRUD
 * - GET /taobao/oauth/url — 生成 OAuth 授权链接
 * - GET /taobao/oauth/callback — OAuth 回调
 * - POST /taobao/poll — TMC 消息轮询端点（前端或 cron 调用）
 * - POST /taobao/webhook/:tenantId — 淘宝消息回调（可选，备用）
 */
import crypto from 'crypto'
import express, { Router, type Request, type Response } from 'express'
import { type TaobaoChannelConfig, getTaobaoConfig, upsertTaobaoConfig } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { redisSet, redisGet, redisDel } from '../redis.js'
import {
  topCall,
  tmcConsume,
  tmcConfirm,
  tmcUserPermit,
  sendWangwangMsg,
  parseChatMessage,
  exchangeCodeForToken,
} from '../plugins/taobao/top-client.js'

// 淘宝 OAuth 授权地址
const TAOBAO_OAUTH_URL = 'https://oauth.taobao.com/authorize'

const router = Router()

// --------------- OAuth 相关 ---------------

router.get('/taobao/oauth/url', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  
  if (!cfg || !cfg.appKey || !cfg.appSecret) {
    res.status(400).json({ success: false, error: '请先配置 appKey 和 appSecret' })
    return
  }

  // 生成随机 state
  const state = crypto.randomBytes(16).toString('hex')
  // 构造回调地址
  const protocol = req.protocol
  const host = req.get('host')
  const redirectUri = `${protocol}://${host}/api/taobao/oauth/callback`

  // 存储 state 和 tenantId 关联（5分钟过期）
  await redisSet(`taobao:oauth:${state}`, JSON.stringify({ tenantId, redirectUri }), 300)

  // 生成授权 URL
  const authUrl = new URL(TAOBAO_OAUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', cfg.appKey)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('view', 'web')

  res.status(200).json({ success: true, data: { authUrl: authUrl.toString() } })
})

// --------------- Config CRUD ---------------

router.get('/taobao/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  res.status(200).json({ success: true, data: cfg ?? null })
})

router.post('/taobao/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<TaobaoChannelConfig>
  const next: TaobaoChannelConfig = {
    appKey: String(body.appKey ?? '').trim(),
    appSecret: String(body.appSecret ?? '').trim(),
    session: String(body.session ?? '').trim(),
    sellerNick: String(body.sellerNick ?? '').trim(),
    tmcGroup: String(body.tmcGroup ?? 'default').trim(),
  }
  if (!next.appKey || !next.appSecret || !next.sellerNick) {
    res.status(400).json({ success: false, error: 'Missing taobao config fields (appKey, appSecret, sellerNick)' })
    return
  }
  await upsertTaobaoConfig(tenantId, next)
  // 自动将卖家加入 TMC 分组
  try {
    await tmcUserPermit(next.appKey, next.appSecret, next.sellerNick, next.tmcGroup, next.session || undefined)
  } catch (e) {
    console.error('[taobao] tmcUserPermit failed:', (e as Error).message)
  }
  res.status(200).json({ success: true, data: next })
})

// --------------- OAuth 回调 ---------------

router.get('/taobao/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const code = String(req.query.code ?? '')
  const state = String(req.query.state ?? '')
  const error = String(req.query.error ?? '')
  const errorDescription = String(req.query.error_description ?? '')

  if (error) {
    res.status(400).json({ success: false, error: errorDescription || error })
    return
  }

  if (!code || !state) {
    res.status(400).json({ success: false, error: 'Missing code or state' })
    return
  }

  // 从 Redis 获取 state 对应的信息
  const stateDataStr = await redisGet(`taobao:oauth:${state}`)
  if (!stateDataStr) {
    res.status(400).json({ success: false, error: 'State 已过期，请重新授权' })
    return
  }

  const stateData = JSON.parse(stateDataStr) as { tenantId: string; redirectUri: string }
  const { tenantId, redirectUri } = stateData

  // 获取配置
  const cfg = await getTaobaoConfig(tenantId)
  if (!cfg || !cfg.appKey || !cfg.appSecret) {
    await redisDel(`taobao:oauth:${state}`)
    res.status(400).json({ success: false, error: '配置不完整' })
    return
  }

  try {
    // 用 code 换取 token
    const tokenResult = await exchangeCodeForToken(cfg.appKey, cfg.appSecret, code, redirectUri)

    // 更新配置
    const newConfig: TaobaoChannelConfig = {
      ...cfg,
      session: tokenResult.access_token,
      sellerNick: tokenResult.taobao_user_nick,
    }
    await upsertTaobaoConfig(tenantId, newConfig)

    // 清理 state
    await redisDel(`taobao:oauth:${state}`)

    // 自动将卖家加入 TMC 分组
    try {
      await tmcUserPermit(cfg.appKey, cfg.appSecret, tokenResult.taobao_user_nick, cfg.tmcGroup, tokenResult.access_token)
    } catch (e) {
      console.error('[taobao] tmcUserPermit failed:', (e as Error).message)
    }

    // 返回成功，可以重定向到前端页面
    res.status(200).json({ 
      success: true, 
      data: { 
        message: '授权成功',
        sellerNick: tokenResult.taobao_user_nick,
      } 
    })
  } catch (e) {
    await redisDel(`taobao:oauth:${state}`)
    console.error('[taobao] OAuth callback error:', e)
    res.status(500).json({ success: false, error: (e as Error).message })
  }
})

// --------------- TMC 消息轮询 ---------------

router.post('/taobao/poll', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Taobao not configured' })
    return
  }
  try {
    const result = await tmcConsume(cfg.appKey, cfg.appSecret, cfg.tmcGroup, '64', cfg.session || undefined)
    const messages = result.messages ?? []
    const processed: string[] = []

    for (const msg of messages) {
      // 处理聊天消息 topic
      if (msg.topic === 'taobao_trade_TradeCreated' || msg.topic.includes('Chat') || msg.topic.includes('wangwang')) {
        const chat = parseChatMessage(msg.content)
        if (chat) {
          // 触发工作流
          const { triggerMatchingWorkflows } = await import('../engine/executor.js')
          void triggerMatchingWorkflows(tenantId, 'trigger.taobao', {
            channel: 'taobao',
            topic: msg.topic,
            conversationId: `taobao:${chat.toUser}`,
            fromId: chat.fromUser,
            toUser: chat.toUser,
            content: chat.content,
            raw: msg,
          }).catch((e) => console.error('[taobao] workflow trigger failed', e))
        }
      }
      processed.push(msg.id)
    }

    // 批量确认消息
    for (const id of processed) {
      try {
        await tmcConfirm(cfg.appKey, cfg.appSecret, id, cfg.tmcGroup, cfg.session || undefined)
      } catch {
        // confirm 失败不影响
      }
    }

    res.status(200).json({ success: true, data: { consumed: messages.length, topics: messages.map((m) => m.topic) } })
  } catch (e) {
    console.error('[taobao] poll error:', (e as Error).message)
    res.status(502).json({ success: false, error: (e as Error).message })
  }
})

// --------------- 发送消息 ---------------

router.post('/taobao/send', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Taobao not configured' })
    return
  }
  const { toUser, content } = (req.body ?? {}) as { toUser?: string; content?: string }
  const user = String(toUser ?? '').trim()
  const text = String(content ?? '').trim()
  if (!user || !text) {
    res.status(400).json({ success: false, error: 'Missing toUser or content' })
    return
  }
  try {
    await sendWangwangMsg(cfg.appKey, cfg.appSecret, cfg.session, user, text)
    res.status(200).json({ success: true, data: true })
  } catch (e) {
    console.error('[taobao] send error:', (e as Error).message)
    res.status(502).json({ success: false, error: (e as Error).message })
  }
})

export default router
