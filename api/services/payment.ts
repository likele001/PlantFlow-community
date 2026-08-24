// api/services/payment.ts
// 支付通道抽象层：当前仅实现虎皮椒（迅虎支付），官方微信 / 官方支付宝预留接口。
//
// 签名逻辑直接移植自 lightmes pro-build/backend/app/services/xunhu_pay.py

import crypto from 'node:crypto'
import { pool } from '../db.js'

// ---------------- 公共签名原语 ----------------

export type CreateOrderInput = {
  orderNo: string
  amountYuan: string
  title: string
  notifyUrl: string
  returnUrl: string
}

export type CreateOrderResult = {
  url: string
  urlQrcode: string
  raw?: unknown
}

export interface PaymentChannel {
  readonly id: 'xunhu' | 'wechat' | 'alipay'
  readonly enabled: () => Promise<boolean>
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>
  verifyNotify(form: Record<string, string>): Promise<boolean>
}

// ---------------- 工具：平台配置读取 ----------------

async function getSetting(key: string): Promise<string> {
  const { rows } = await pool.query<{ value: string | null }>(
    'SELECT value FROM payment_settings WHERE key = $1',
    [key],
  )
  return rows[0]?.value ?? ''
}

function xunhuSign(params: Record<string, string>, secret: string): string {
  const items = Object.keys(params)
    .filter((k) => k !== 'hash' && k !== 'sign' && params[k] != null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('md5').update(items + secret, 'utf8').digest('hex')
}

// ---------------- 虎皮椒（迅虎）-----------------

class XunhuChannel implements PaymentChannel {
  readonly id = 'xunhu' as const
  async enabled(): Promise<boolean> {
    return (await getSetting('xunhu_enabled')) === 'true'
      && Boolean(await getSetting('xunhu_app_id'))
      && Boolean(await getSetting('xunhu_app_secret'))
  }
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const [appId, secret, gateway] = await Promise.all([
      getSetting('xunhu_app_id'),
      getSetting('xunhu_app_secret'),
      getSetting('xunhu_gateway'),
    ])
    if (!appId || !secret) throw new Error('虎皮椒未配置 app_id / app_secret')

    const ts = Math.floor(Date.now() / 1000)
    const params: Record<string, string> = {
      version: '1.1',
      appid: appId,
      trade_order_id: input.orderNo,
      total_fee: input.amountYuan,
      title: input.title.slice(0, 128),
      time: String(ts),
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      nonce_str: String(Date.now()),
    }
    params.hash = xunhuSign(params, secret)

    const resp = await fetch(gateway || 'https://api.xunhupay.com/payment/do.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    const data = (await resp.json().catch(() => null)) as
      | { errcode: number; errmsg?: string; url?: string; url_qrcode?: string }
      | null
    if (!data || data.errcode !== 0) {
      throw new Error(data?.errmsg || `虎皮椒下单失败 (errcode=${data?.errcode ?? 'null'})`)
    }
    if (!data.url) throw new Error('虎皮椒返回数据缺少 url')
    return { url: data.url, urlQrcode: data.url_qrcode || data.url, raw: data }
  }
  async verifyNotify(form: Record<string, string>): Promise<boolean> {
    const secret = await getSetting('xunhu_app_secret')
    if (!secret) return false
    const received = form.hash || form.sign
    if (!received) return false
    const check: Record<string, string> = {}
    for (const [k, v] of Object.entries(form)) {
      if (k === 'hash' || k === 'sign') continue
      check[k] = String(v)
    }
    return xunhuSign(check, secret) === received
  }
}

// ---------------- 官方微信支付（V3）—— 预留接口，本期不实装 ----------------

class WechatChannel implements PaymentChannel {
  readonly id = 'wechat' as const
  async enabled(): Promise<boolean> {
    return (await getSetting('wechat_enabled')) === 'true'
  }
  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new Error('官方微信支付尚未启用，请先在支付配置中开启并填入商户信息（V3: mch_id / app_id / api_v3_key / 私钥）')
  }
  async verifyNotify(_form: Record<string, string>): Promise<boolean> {
    // TODO 接入微信 V3：
    //   1) 校验 Wechatpay-Signature（用平台证书 / api_v3_key 验签）
    //   2) AES-256-GCM 解密 resource.ciphertext
    //   3) 返回解密后的明文 JSON
    throw new Error('官方微信支付回调尚未实现')
  }
}

// ---------------- 官方支付宝 —— 预留接口，本期不实装 ----------------

class AlipayChannel implements PaymentChannel {
  readonly id = 'alipay' as const
  async enabled(): Promise<boolean> {
    return (await getSetting('alipay_enabled')) === 'true'
  }
  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new Error('官方支付宝尚未启用，请先在支付配置中开启并填入应用 ID / 私钥 / 公钥')
  }
  async verifyNotify(_form: Record<string, string>): Promise<boolean> {
    // TODO 接入支付宝：
    //   1) 验签（用支付宝公钥验 sign 字段）
    //   2) 校验 notify_id 防重放
    //   3) 校验 trade_status = TRADE_SUCCESS / TRADE_FINISHED
    throw new Error('官方支付宝回调尚未实现')
  }
}

// ---------------- 注册表 ----------------

const registry: Record<PaymentChannel['id'], PaymentChannel> = {
  xunhu: new XunhuChannel(),
  wechat: new WechatChannel(),
  alipay: new AlipayChannel(),
}

export function getChannel(id: string): PaymentChannel {
  const ch = registry[id as PaymentChannel['id']]
  if (!ch) throw new Error(`不支持的支付通道：${id}`)
  return ch
}

export function listChannelIds(): PaymentChannel['id'][] {
  return ['xunhu', 'wechat', 'alipay']
}