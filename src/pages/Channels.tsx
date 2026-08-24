import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type WecomConfig = {
  corpId: string
  agentId: string
  secret: string
  token: string
  encodingAESKey: string
}

type FeishuConfig = {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
}

type DingtalkConfig = {
  appKey: string
  appSecret: string
  agentId?: number | string
  token?: string
  encodingAESKey?: string
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{props.label}</div>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        className={cn(
          'h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition',
          'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
          'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
        )}
      />
    </label>
  )
}

export default function Channels() {
  const { token, tenant } = useAuthStore()
  const tenantId = tenant?.id ?? ''
  const [tab, setTab] = useState<'wecom' | 'feishu' | 'dingtalk'>('wecom')

  const [wecom, setWecom] = useState<WecomConfig>({
    corpId: '',
    agentId: '',
    secret: '',
    token: '',
    encodingAESKey: '',
  })
  const [feishu, setFeishu] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    verificationToken: '',
    encryptKey: '',
  })
  const [dingtalk, setDingtalk] = useState<DingtalkConfig>({
    appKey: '',
    appSecret: '',
    agentId: '',
    token: '',
    encodingAESKey: '',
  })

  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const wecomWebhookUrl = useMemo(() => {
    if (!tenantId) return ''
    return `${window.location.origin}/api/channels/wecom/webhook/${tenantId}`
  }, [tenantId])

  const feishuWebhookUrl = useMemo(() => {
    if (!tenantId) return ''
    return `${window.location.origin}/api/channels/feishu/webhook/${tenantId}`
  }, [tenantId])

  const dingtalkWebhookUrl = useMemo(() => {
    if (!tenantId) return ''
    return `${window.location.origin}/api/channels/dingtalk/webhook/${tenantId}`
  }, [tenantId])

  useEffect(() => {
    async function load() {
      if (!token) return
      setErr(null)
      const [w, f, d] = await Promise.all([
        apiRequest<WecomConfig | null>('/api/channels/wecom/config', { token }),
        apiRequest<FeishuConfig | null>('/api/channels/feishu/config', { token }),
        apiRequest<DingtalkConfig | null>('/api/channels/dingtalk/config', { token }),
      ])
      if ('data' in w && w.data) setWecom(w.data)
      if ('data' in f && f.data) setFeishu(f.data)
      if ('data' in d && d.data) setDingtalk(d.data)
    }
    void load()
  }, [token])

  async function saveWecom() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const res = await apiRequest<WecomConfig>('/api/channels/wecom/config', { method: 'POST', token, body: wecom })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setWecom(res.data)
    setStatus('企业微信配置已保存')
  }

  async function saveFeishu() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const res = await apiRequest<FeishuConfig>('/api/channels/feishu/config', { method: 'POST', token, body: feishu })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setFeishu(res.data)
    setStatus('飞书配置已保存')
  }

  async function saveDingtalk() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const body = {
      ...dingtalk,
      agentId: dingtalk.agentId ? String(dingtalk.agentId) : undefined,
    }
    const res = await apiRequest<DingtalkConfig>('/api/channels/dingtalk/config', { method: 'POST', token, body })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setDingtalk(res.data)
    setStatus('钉钉配置已保存')
  }

  const [wecomTest, setWecomTest] = useState({ toUser: '', toParty: '', toTag: '', content: '测试消息：渠道接入成功' })
  const [feishuTest, setFeishuTest] = useState({ receiveIdType: 'chat_id' as 'chat_id' | 'open_id', receiveId: '', content: '测试消息：渠道接入成功' })
  const [dingtalkTest, setDingtalkTest] = useState({ userIdList: '', content: '测试消息：渠道接入成功' })

  async function sendWecomTest() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const res = await apiRequest<boolean>('/api/channels/wecom/send', { method: 'POST', token, body: wecomTest })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setStatus('企业微信测试消息已发送')
  }

  async function sendFeishuTest() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const res = await apiRequest<boolean>('/api/channels/feishu/send', { method: 'POST', token, body: feishuTest })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setStatus('飞书测试消息已发送')
  }

  async function sendDingtalkTest() {
    if (!token) return
    setStatus(null)
    setErr(null)
    const res = await apiRequest<boolean>('/api/channels/dingtalk/send', { 
      method: 'POST', 
      token, 
      body: { 
        userIdList: dingtalkTest.userIdList.split(',').map(u => u.trim()).filter(Boolean),
        content: dingtalkTest.content 
      } 
    })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setStatus('钉钉测试消息已发送')
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">渠道接入</div>
        <div className="mt-2 text-2xl font-semibold">企业微信 · 飞书 · 钉钉（应用 + 机器人）</div>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          回调默认以“租户维度”区分，支持群与私聊事件类型。
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          {err}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {status}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('wecom')}
          className={cn(
            'h-10 rounded-xl px-4 text-sm font-semibold transition',
            tab === 'wecom'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900',
          )}
        >
          企业微信
        </button>
        <button
          type="button"
          onClick={() => setTab('feishu')}
          className={cn(
            'h-10 rounded-xl px-4 text-sm font-semibold transition',
            tab === 'feishu'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900',
          )}
        >
          飞书
        </button>
        <button
          type="button"
          onClick={() => setTab('dingtalk')}
          className={cn(
            'h-10 rounded-xl px-4 text-sm font-semibold transition',
            tab === 'dingtalk'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900',
          )}
        >
          钉钉
        </button>
      </div>

      {tab === 'wecom' ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">企业微信配置</div>
            <div className="mt-4 space-y-4">
              <Field label="CorpId" value={wecom.corpId} onChange={(v) => setWecom((s) => ({ ...s, corpId: v }))} placeholder="wwxxxxxxxxxxxxxx" />
              <Field label="AgentId" value={wecom.agentId} onChange={(v) => setWecom((s) => ({ ...s, agentId: v }))} placeholder="1000002" />
              <Field label="Secret" value={wecom.secret} onChange={(v) => setWecom((s) => ({ ...s, secret: v }))} placeholder="应用 Secret" type="password" />
              <Field label="Token" value={wecom.token} onChange={(v) => setWecom((s) => ({ ...s, token: v }))} placeholder="回调 Token" type="password" />
              <Field label="EncodingAESKey" value={wecom.encodingAESKey} onChange={(v) => setWecom((s) => ({ ...s, encodingAESKey: v }))} placeholder="回调 EncodingAESKey" type="password" />
              <button
                type="button"
                onClick={() => void saveWecom()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                保存配置
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">回调地址</div>
              <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                {wecomWebhookUrl || '未获取到租户信息'}
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                外网接入时请用公网域名替换 {window.location.origin}，并在企业微信后台配置回调。
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">发送测试消息</div>
              <div className="mt-4 space-y-4">
                <Field label="ToUser（可选）" value={wecomTest.toUser} onChange={(v) => setWecomTest((s) => ({ ...s, toUser: v }))} placeholder="成员 UserId" />
                <Field label="ToParty（可选）" value={wecomTest.toParty} onChange={(v) => setWecomTest((s) => ({ ...s, toParty: v }))} placeholder="部门ID，支持 1|2" />
                <Field label="ToTag（可选）" value={wecomTest.toTag} onChange={(v) => setWecomTest((s) => ({ ...s, toTag: v }))} placeholder="标签ID，支持 1|2" />
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">内容</div>
                  <textarea
                    value={wecomTest.content}
                    onChange={(e) => setWecomTest((s) => ({ ...s, content: e.target.value }))}
                    className={cn(
                      'h-24 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition',
                      'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                      'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
                    )}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void sendWecomTest()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'feishu' ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">飞书配置</div>
            <div className="mt-4 space-y-4">
              <Field label="AppId" value={feishu.appId} onChange={(v) => setFeishu((s) => ({ ...s, appId: v }))} placeholder="cli_xxx" />
              <Field label="AppSecret" value={feishu.appSecret} onChange={(v) => setFeishu((s) => ({ ...s, appSecret: v }))} placeholder="应用 Secret" type="password" />
              <Field label="VerificationToken" value={feishu.verificationToken} onChange={(v) => setFeishu((s) => ({ ...s, verificationToken: v }))} placeholder="事件订阅 Token" type="password" />
              <Field label="EncryptKey" value={feishu.encryptKey} onChange={(v) => setFeishu((s) => ({ ...s, encryptKey: v }))} placeholder="事件订阅 Encrypt Key" type="password" />
              <button
                type="button"
                onClick={() => void saveFeishu()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                保存配置
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">回调地址</div>
              <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                {feishuWebhookUrl || '未获取到租户信息'}
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                外网接入时请用公网域名替换 {window.location.origin}，并在飞书开放平台事件订阅里配置。
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">发送测试消息</div>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">ReceiveIdType</div>
                  <select
                    value={feishuTest.receiveIdType}
                    onChange={(e) => setFeishuTest((s) => ({ ...s, receiveIdType: e.target.value === 'open_id' ? 'open_id' : 'chat_id' }))}
                    className={cn(
                      'h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition',
                      'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                      'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
                    )}
                  >
                    <option value="chat_id">chat_id（群/会话）</option>
                    <option value="open_id">open_id（个人）</option>
                  </select>
                </label>
                <Field label="ReceiveId" value={feishuTest.receiveId} onChange={(v) => setFeishuTest((s) => ({ ...s, receiveId: v }))} placeholder="chat_id 或 open_id" />
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">内容</div>
                  <textarea
                    value={feishuTest.content}
                    onChange={(e) => setFeishuTest((s) => ({ ...s, content: e.target.value }))}
                    className={cn(
                      'h-24 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition',
                      'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                      'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
                    )}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void sendFeishuTest()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'dingtalk' ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">钉钉配置</div>
            <div className="mt-4 space-y-4">
              <Field label="AppKey" value={dingtalk.appKey} onChange={(v) => setDingtalk((s) => ({ ...s, appKey: v }))} placeholder="dingxxxxxxxxxxxxxx" />
              <Field label="AppSecret" value={dingtalk.appSecret} onChange={(v) => setDingtalk((s) => ({ ...s, appSecret: v }))} placeholder="应用 Secret" type="password" />
              <Field label="AgentId（可选）" value={String(dingtalk.agentId ?? '')} onChange={(v) => setDingtalk((s) => ({ ...s, agentId: v }))} placeholder="123456789" />
              <Field label="Token（可选）" value={dingtalk.token ?? ''} onChange={(v) => setDingtalk((s) => ({ ...s, token: v }))} placeholder="回调 Token" type="password" />
              <Field label="EncodingAESKey（可选）" value={dingtalk.encodingAESKey ?? ''} onChange={(v) => setDingtalk((s) => ({ ...s, encodingAESKey: v }))} placeholder="回调 EncodingAESKey" type="password" />
              <button
                type="button"
                onClick={() => void saveDingtalk()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                保存配置
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">回调地址</div>
              <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                {dingtalkWebhookUrl || '未获取到租户信息'}
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                外网接入时请用公网域名替换 {window.location.origin}，并在钉钉开放平台配置回调。
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">发送测试消息</div>
              <div className="mt-4 space-y-4">
                <Field label="UserIdList（逗号分隔）" value={dingtalkTest.userIdList} onChange={(v) => setDingtalkTest((s) => ({ ...s, userIdList: v }))} placeholder="manager123,user456" />
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">内容</div>
                  <textarea
                    value={dingtalkTest.content}
                    onChange={(e) => setDingtalkTest((s) => ({ ...s, content: e.target.value }))}
                    className={cn(
                      'h-24 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition',
                      'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                      'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
                    )}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void sendDingtalkTest()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

