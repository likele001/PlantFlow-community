import { db } from '../store.js'

// N7: 配额硬执行。仅当租户配置了 tenant_quotas 时生效（默认不限制）。
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuotaExceededError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export async function assertQuotaAllowed(
  tenantId: string,
  kind: 'chat' | 'tool' | 'embedding' = 'chat',
): Promise<void> {
  // embedding 为辅助成本，不纳入硬停服，避免拦截高频向量化
  if (kind === 'embedding') return
  const q = await db.getTenantQuota(tenantId)
  if (!q) return
  const used = await db.quotaUsageForTenant(tenantId, q.period)
  const hit: string[] = []
  if (q.maxCalls != null && used.calls >= q.maxCalls) hit.push(`调用次数 ${used.calls}/${q.maxCalls}`)
  if (q.maxTokens != null && used.tokens >= q.maxTokens) hit.push(`Token ${used.tokens}/${q.maxTokens}`)
  if (q.maxCost != null && used.cost >= q.maxCost) hit.push(`成本 $${used.cost.toFixed(2)}/$${q.maxCost}`)
  if (!hit.length) return
  const msg = `AI 配额已用尽（${hit.join('；')}）。该租户已被暂停 AI 调用，请在运营计量页调整配额或等待下一计费周期。`
  void db.recordQuotaAlert(tenantId, { title: 'AI 配额已用尽', message: msg })
  throw new QuotaExceededError(msg)
}

export async function assertWalletAllowed(
  tenantId: string,
  estCostUsd: number,
  kind: 'chat' | 'tool' | 'embedding' = 'chat',
): Promise<void> {
  // embedding 不强制扣费（保持兼容）
  if (kind === 'embedding') return
  const bal = await db.getWalletBalance(tenantId)
  if (bal < estCostUsd) {
    const msg = `钱包余额不足（当前 $${bal.toFixed(4)}，预估本次需 $${estCostUsd.toFixed(4)}）。请充值后再试。`
    void db.recordQuotaAlert(tenantId, { title: '钱包余额不足', message: msg })
    throw new QuotaExceededError(msg)
  }
}

export async function chargeAfterLlm(
  tenantId: string,
  costUsd: number,
  ref: { kind: 'chat' | 'embedding' | 'tool'; refId?: string; remark?: string },
): Promise<void> {
  if (ref.kind === 'embedding') return
  if (costUsd <= 0) return
  await db.chargeWalletForLlm(tenantId, costUsd, ref)
}
