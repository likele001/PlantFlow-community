import { db } from '../store.js'
import { assertQuotaAllowed, assertWalletAllowed, chargeAfterLlm } from './quota.js'

// ---- F6: LLM 用量采集（token/成本） ----
export type UsageContext = {
  executionId?: string | null
  nodeId?: string | null
  agentId?: string | null
  sessionId?: string | null
  kind?: 'chat' | 'embedding' | 'tool'
}

type UsagePayload = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

// 粗略成本估算：美元/M 输入token，按模型名归类；未识别按通用档位
const PRICING: { input: number; output: number }[] = [
  { input: 0.15, output: 0.60 },   // 通用
]
let COST_INPUT = 0.15
let COST_OUTPUT = 0.60

export function setUsagePricing(inputUsdPerM: number, outputUsdPerM: number) {
  COST_INPUT = inputUsdPerM
  COST_OUTPUT = outputUsdPerM
}

export function estimateLlmCost(promptTokens: number, completionTokens: number): number {
  const usd = (promptTokens / 1_000_000) * COST_INPUT + (completionTokens / 1_000_000) * COST_OUTPUT
  return Math.round(usd * 1_000_000) / 1_000_000
}

async function recordUsage(opts: {
  tenantId: string
  usage?: UsagePayload | null
  model?: string
  providerId?: string | null
  providerName?: string | null
  ctx?: UsageContext | null
}): Promise<void> {
  const usage = opts.usage
  const prompt = Math.round(Number(usage?.prompt_tokens ?? 0))
  const completion = Math.round(Number(usage?.completion_tokens ?? 0))
  if (prompt + completion <= 0) return
  const kind = opts.ctx?.kind ?? 'chat'
  await db.insertLlmUsage({
    tenantId: opts.tenantId,
    executionId: opts.ctx?.executionId ?? null,
    nodeId: opts.ctx?.nodeId ?? null,
    agentId: opts.ctx?.agentId ?? null,
    sessionId: opts.ctx?.sessionId ?? null,
    kind,
    providerId: opts.providerId ?? null,
    providerName: opts.providerName ?? null,
    model: opts.model ?? null,
    promptTokens: prompt,
    completionTokens: completion,
    estimatedCost: estimateLlmCost(prompt, completion),
  })
}

export async function getDefaultProvider(tenantId: string) {
  const providers = await db.listProviders(tenantId)
  const provider = providers.find((p) => p.isDefault) ?? providers[0]
  if (!provider) throw new Error('未配置 AI 模型提供商')
  const secret = await db.getProviderSecret(tenantId, provider.id)
  if (!secret) throw new Error('AI 提供商凭据不可用')
  return { provider, secret }
}

export async function getEmbeddingProvider(tenantId: string) {
  const providers = await db.listProviders(tenantId)
  const provider = providers.find((p) => p.isDefaultEmbedding && p.defaultEmbeddingModel)
    ?? providers.find((p) => p.isDefault && p.defaultEmbeddingModel)
    ?? providers[0]
  if (!provider) throw new Error('未配置 AI 模型提供商')
  if (!provider.defaultEmbeddingModel) throw new Error('未配置 Embedding 模型')
  const secret = await db.getProviderSecret(tenantId, provider.id)
  if (!secret) throw new Error('AI 提供商凭据不可用')
  return { provider, secret }
}

export async function chatCompletion(
  tenantId: string,
  messages: { role: string; content: string; tool_calls?: unknown }[],
  opts?: { model?: string; tools?: unknown[]; temperature?: number; usageContext?: UsageContext },
) {
  await assertQuotaAllowed(tenantId, opts?.usageContext?.kind ?? 'chat')
  const { provider, secret } = await getDefaultProvider(tenantId)
  const model = opts?.model || provider.defaultChatModel
  const url = `${secret.baseUrl}/chat/completions`
  // 预估本次成本（按 2048 max_tokens 上限做上限估算，避免余额估算过低）
  const estPrompt = (opts?.usageContext as any)?.estPromptTokens ?? 1024
  const estCost = estimateLlmCost(estPrompt, Math.min(secret.maxTokens ?? 2048, 2048))
  await assertWalletAllowed(tenantId, estCost, opts?.usageContext?.kind ?? 'chat')
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts?.temperature ?? secret.temperature ?? 0.7,
    top_p: secret.topP ?? 1.0,
    max_tokens: secret.maxTokens ?? 2048,
    presence_penalty: secret.presencePenalty ?? 0,
    frequency_penalty: secret.frequencyPenalty ?? 0,
  }
  if (opts?.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await r.json().catch(() => null)) as {
    choices?: { message?: { content?: string; tool_calls?: unknown[] } }[]
    error?: { message?: string }
  } | null
  if (!r.ok) throw new Error(data?.error?.message ?? `LLM HTTP ${r.status}`)
  const usage = (data as { usage?: UsagePayload } | null)?.usage
  void recordUsage({
    tenantId,
    usage,
    model,
    providerId: provider.id,
    providerName: provider.name,
    ctx: opts?.usageContext,
  })
  // 按实际 token 扣费
  const prompt = Math.round(Number(usage?.prompt_tokens ?? 0))
  const completion = Math.round(Number(usage?.completion_tokens ?? 0))
  if (prompt + completion > 0) {
    void chargeAfterLlm(tenantId, estimateLlmCost(prompt, completion), {
      kind: opts?.usageContext?.kind ?? 'chat',
      refId: opts?.usageContext?.executionId ?? undefined,
      remark: `LLM ${model}`,
    })
  }
  return data?.choices?.[0]?.message ?? { content: '' }
}

export async function chatCompletionStream(
  tenantId: string,
  messages: { role: string; content: string }[],
  onDelta: (text: string) => void,
  opts?: { model?: string },
): Promise<string> {
  await assertQuotaAllowed(tenantId, 'chat')
  const { provider, secret } = await getDefaultProvider(tenantId)
  const model = opts?.model || provider.defaultChatModel
  const url = `${secret.baseUrl}/chat/completions`
  await assertWalletAllowed(tenantId, estimateLlmCost(1024, Math.min(secret.maxTokens ?? 2048, 2048)), 'chat')
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: secret.temperature ?? 0.7,
      top_p: secret.topP ?? 1.0,
      max_tokens: secret.maxTokens ?? 2048,
      presence_penalty: secret.presencePenalty ?? 0,
      frequency_penalty: secret.frequencyPenalty ?? 0,
      stream: true,
    }),
  })
  if (!r.ok || !r.body) {
    const err = await r.text()
    throw new Error(err || `LLM HTTP ${r.status}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch { /* skip */ }
    }
  }
  return full
}

export async function createEmbedding(tenantId: string, text: string, usageContext?: UsageContext): Promise<number[]> {
  const { provider, secret } = await getEmbeddingProvider(tenantId)
  const model = provider.defaultEmbeddingModel!
  const url = `${secret.baseUrl}/embeddings`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret.apiKey}`,
    },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  })
  const data = (await r.json().catch(() => null)) as {
    data?: { embedding?: number[] }[]
    error?: { message?: string }
  } | null
  if (!r.ok) throw new Error(data?.error?.message ?? `Embedding HTTP ${r.status}`)
  const vec = data?.data?.[0]?.embedding
  if (!vec?.length) throw new Error('Embedding 返回为空')
  const usage = (data as { usage?: UsagePayload } | null)?.usage
  void recordUsage({
    tenantId,
    usage,
    model,
    providerId: provider.id,
    providerName: provider.name,
    ctx: { ...usageContext, kind: 'embedding' },
  })
  return vec
}
