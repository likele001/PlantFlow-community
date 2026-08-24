/**
 * 钉钉开放平台客户端
 * - 获取 access_token
 * - 发送消息
 * - 回调事件处理
 */

import crypto from 'crypto'

// --------------- types ---------------

export interface DingtalkAppConfig {
  appKey: string
  appSecret: string
  agentId?: number
}

export interface DingtalkChannelConfig {
  appKey: string
  appSecret: string
  agentId?: number
}

interface DingtalkResponse<T = unknown> {
  errcode: number
  errmsg: string
  result?: T
  access_token?: string
  expires_in?: number
}

// --------------- token 缓存 ---------------

interface TokenCache {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCache>()

// --------------- API 基础 ---------------

const DINGTALK_OAPI_URL = 'https://oapi.dingtalk.com'

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  const cacheKey = `${appKey}:${appSecret}`
  const cached = tokenCache.get(cacheKey)

  // 检查缓存是否还有效（提前5分钟过期）
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken
  }

  // 获取新 token
  const url = new URL(`${DINGTALK_OAPI_URL}/gettoken`)
  url.searchParams.set('appkey', appKey)
  url.searchParams.set('appsecret', appSecret)

  const res = await fetch(url.toString())
  const data = (await res.json()) as DingtalkResponse<{ access_token: string; expires_in: number }>

  if (data.errcode !== 0) {
    throw new Error(`钉钉获取 token 失败: ${data.errcode} ${data.errmsg}`)
  }

  const accessToken = data.access_token!
  const expiresIn = data.expires_in! || 7200

  // 缓存
  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  })

  return accessToken
}

async function dingtalkRequest<T = unknown>(
  appKey: string,
  appSecret: string,
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
): Promise<T> {
  const accessToken = await getAccessToken(appKey, appSecret)
  const url = new URL(`${DINGTALK_OAPI_URL}${path}`)
  url.searchParams.set('access_token', accessToken)

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (body && method === 'POST') {
    init.body = JSON.stringify(body)
  }

  const res = await fetch(url.toString(), init)
  const data = (await res.json()) as DingtalkResponse<T>

  if (data.errcode !== 0) {
    throw new Error(`钉钉 API 失败: ${data.errcode} ${data.errmsg}`)
  }

  return data.result as T
}

// --------------- 消息发送 ---------------

/**
 * 发送工作通知消息
 */
export async function sendCorpConversation(
  config: DingtalkAppConfig,
  params: {
    userid_list: string
    msg: Record<string, unknown>
    agent_id: number
  },
): Promise<{ task_id: number }> {
  return dingtalkRequest<{ task_id: number }>(
    config.appKey,
    config.appSecret,
    '/topapi/message/corpconversation/asyncsend_v2',
    'POST',
    params,
  )
}

/**
 * 发送文本消息（简化版）
 */
export async function sendTextMessage(
  config: DingtalkAppConfig,
  userIdList: string[],
  content: string,
): Promise<{ task_id: number }> {
  if (!config.agentId) {
    throw new Error('需要配置 agentId')
  }

  return sendCorpConversation(config, {
    userid_list: userIdList.join(','),
    agent_id: config.agentId,
    msg: {
      msgtype: 'text',
      text: { content },
    },
  })
}

// --------------- 通讯录 ---------------

/**
 * 获取部门列表
 */
export async function getDepartmentList(
  config: DingtalkAppConfig,
  deptId?: number,
): Promise<Array<{ dept_id: number; name: string; parent_id: number; order: number }>> {
  const result = await dingtalkRequest<{ dept_list: Array<{ dept_id: number; name: string; parent_id: number; order: number }> }>(
    config.appKey,
    config.appSecret,
    '/topapi/v2/department/listsub',
    'POST',
    deptId ? { dept_id: deptId } : undefined,
  )
  return result.dept_list
}

/**
 * 获取用户详情
 */
export async function getUser(
  config: DingtalkAppConfig,
  userid: string,
): Promise<{
  userid: string
  unionid: string
  name: string
  mobile?: string
  email?: string
  dept_id_list?: number[]
}> {
  return dingtalkRequest(
    config.appKey,
    config.appSecret,
    '/topapi/v2/user/get',
    'POST',
    { userid },
  )
}

/**
 * 获取部门用户
 */
export async function getDepartmentUserList(
  config: DingtalkAppConfig,
  deptId: number,
  size = 50,
  cursor = 0,
): Promise<{
  has_more: boolean
  next_cursor: number
  userlist: Array<{ userid: string; name: string; mobile?: string }>
}> {
  return dingtalkRequest(
    config.appKey,
    config.appSecret,
    '/topapi/user/list',
    'POST',
    { dept_id: deptId, size, cursor },
  )
}

// --------------- 回调验证 ---------------

/**
 * 验证回调签名
 */
export function verifyCallbackSignature(
  signature: string,
  timestamp: string,
  nonce: string,
  body: string,
  token: string,
): boolean {
  const sortList = [token, timestamp, nonce, body].sort()
  const signStr = sortList.join('')
  const hash = crypto.createHash('sha1').update(signStr, 'utf8').digest('hex')
  return hash === signature
}

/**
 * 解密回调数据
 */
export function decryptCallbackData(
  encrypt: string,
  encodingAESKey: string,
): {
  msg: string
  appId: string
} {
  // Base64 解码
  const encrypted = Buffer.from(encrypt, 'base64')
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64')
  
  // AES-256-CBC 解密
  const iv = aesKey.slice(0, 16)
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv)
  decipher.setAutoPadding(true)
  
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  
  // 解析内容
  const content = decrypted.slice(16) // 移除前面的长度
  const padLength = content[content.length - 1]
  const realContent = content.slice(0, content.length - padLength).toString('utf8')
  
  const result = JSON.parse(realContent) as { msg: string; appId: string }
  return result
}

export default {
  getAccessToken,
  sendCorpConversation,
  sendTextMessage,
  getDepartmentList,
  getUser,
  getDepartmentUserList,
  verifyCallbackSignature,
  decryptCallbackData,
}
