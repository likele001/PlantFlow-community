/**
 * PG-backed data access. The exported `db` shape mirrors the previous
 * in-memory store closely so route handlers can be updated with minimal
 * changes (mostly adding `await`).
 */
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'
import type { WorkflowDefinition } from './engine/types.js'
import { redisPushJob } from './redis.js'

export type Id = string

export type Tenant = {
  id: Id
  name: string
  createdAt: string
}

export type TaobaoChannelConfig = {
  appKey: string
  appSecret: string
  session: string
  sellerNick: string
  tmcGroup: string
}

export type User = {
  id: Id
  email: string
  password: string
  createdAt: string
}

export type Membership = {
  id: Id
  tenantId: Id
  userId: Id
  role: 'platform_admin' | 'tenant_admin' | 'developer' | 'operator' | 'agent'
}

export type Workflow = {
  id: Id
  tenantId: Id
  name: string
  status: 'draft' | 'published' | 'archived'
  definition?: WorkflowDefinition
  createdAt: string
  updatedAt: string
}

export type Execution = {
  id: Id
  tenantId: Id
  workflowId: Id
  workflowName?: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  triggerType: string
  triggerData?: unknown
  error?: string | null
  parentExecutionId?: string | null
  createdBy?: Id | null
  startedAt: string
  finishedAt?: string | null
}

export type ChildExecution = {
  id: Id
  workflowId: Id
  workflowName?: string
  status: Execution['status']
  triggerType: string
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

export type ExecutionStep = {
  id: Id
  executionId: Id
  nodeId: string
  nodeType: string
  nodeLabel: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  input?: unknown
  output?: unknown
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

export type KnowledgeBase = {
  id: Id
  tenantId: Id
  name: string
  description?: string | null
  documentCount?: number
  chunkCount?: number
  vectorizedChunkCount?: number
  createdAt: string
  updatedAt: string
  chunkStrategy?: string
  chunkSize?: number
  chunkOverlap?: number
  separator?: string
}

export type KnowledgeDocument = {
  id: Id
  kbaseId: Id
  tenantId: Id
  title: string
  sourceType: string
  content: string
  createdAt: string
}

export type KnowledgeChunkHit = {
  id: Id
  content: string
  title: string
  score: number
  documentId?: Id
  chunkIndex?: number
  sourceType?: string
  preview?: string
}

export type Connector = {
  id: Id
  tenantId: Id
  name: string
  type: 'http' | 'database' | 'wecom' | 'feishu' | 'custom'
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type DataSource = {
  id: Id
  tenantId: Id
  name: string
  kind: 'mysql' | 'postgres' | 'http' | 'csv' | 'object_storage' | 'oauth' | 'apikey' | 'spreadsheet' | 'email' | 'oss'
  config: Record<string, unknown>
  credentialId: Id | null
  status: 'draft' | 'testing' | 'active' | 'error'
  allowQuery: boolean
  fieldAllowlist: string[]
  lastOkAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type DataAccessAudit = {
  id: Id
  tenantId: Id
  sourceId: Id | null
  userId: Id | null
  operation: string
  queryText: string | null
  rowCount: number | null
  durationMs: number | null
  error: string | null
  createdAt: string
}

export type Agent = {
  id: Id
  tenantId: Id
  name: string
  description: string
  systemPrompt: string
  modelProviderId: Id | null
  tools: string[]
  allowedSources: string[]
  maxTurns: number
  timeoutMs: number
  status: 'draft' | 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

export type AgentSession = {
  id: Id
  tenantId: Id
  agentId: Id | null
  channel: string | null
  externalId: string | null
  summary: string
  history: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>
  createdAt: string
  updatedAt: string
}

export type AuditLog = {
  id: Id
  tenantId: Id
  userId?: Id | null
  userEmail?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  detail?: unknown
  createdAt: string
}

export type TenantMember = {
  membershipId: Id
  userId: Id
  email: string
  role: Membership['role']
  createdAt: string
}

export type DashboardStats = {
  executionsToday: number
  successRate: number
  alertsToday: number
  messagesToday: number
  aiCallsToday: number
  failureTop: { workflowName: string; reason: string; count: number }[]
}

export type Conversation = {
  id: Id
  tenantId: Id
  channel: 'wecom' | 'feishu' | 'dingtalk' | 'taobao'
  externalId: string
  kind: 'group' | 'direct'
  title: string
  updatedAt: string
}

export type Message = {
  id: Id
  tenantId: Id
  conversationId: Id
  direction: 'in' | 'out'
  senderId: string
  senderName?: string
  content: string
  createdAt: string
  raw?: unknown
}

export type WecomChannelConfig = {
  corpId: string
  agentId: string
  secret: string
  token: string
  encodingAESKey: string
}

export type FeishuChannelConfig = {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
}

export type DingtalkChannelConfig = {
  appKey: string
  appSecret: string
  agentId?: number
  token?: string
  encodingAESKey?: string
}

export type ChannelConfig = {
  tenantId: Id
  wecom?: WecomChannelConfig
  feishu?: FeishuChannelConfig
  dingtalk?: DingtalkChannelConfig
}

export type Credential = {
  id: Id
  tenantId: Id
  name: string
  type: 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom'
  data: Record<string, unknown>
  maskedPreview: string
  createdAt: string
  updatedAt: string
}

export type OAuthState = {
  id: Id
  credentialId: Id
  state: string
  redirectUri: string
  extra: Record<string, unknown>
  expiresAt: string
}

type TokenSession = {
  token: string
  userId: Id
  tenantId: Id
  createdAt: string
  kind: 'tenant' | 'platform'
}

type CachedToken = {
  token: string
  expiresAt: number
}

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  // Use crypto.randomUUID (available in Node 19+; container runs node:22)
  return crypto.randomUUID()
}

/* ---------- LLM providers ---------- */

export type LlmProvider = {
  id: Id
  tenantId: Id
  name: string
  baseUrl: string
  apiKeyMasked: string
  defaultChatModel: string
  defaultEmbeddingModel: string | null
  isDefault: boolean
  isDefaultEmbedding: boolean
  createdAt: string
  updatedAt: string
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

export type LlmProviderSecret = {
  baseUrl: string
  apiKey: string
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

const PROVIDER_COLS = `
  id, tenant_id AS "tenantId", name, base_url AS "baseUrl",
  api_key_masked AS "apiKeyMasked",
  default_chat_model AS "defaultChatModel",
  default_embedding_model AS "defaultEmbeddingModel",
  is_default AS "isDefault",
  is_default_embedding AS "isDefaultEmbedding",
  temperature, top_p AS "topP", max_tokens AS "maxTokens",
  presence_penalty AS "presencePenalty", frequency_penalty AS "frequencyPenalty",
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function listProviders(tenantId: Id): Promise<LlmProvider[]> {
  const { rows } = await pool.query<LlmProvider>(
    `SELECT ${PROVIDER_COLS} FROM llm_providers WHERE tenant_id = $1 ORDER BY is_default DESC, is_default_embedding DESC, created_at ASC`,
    [tenantId],
  )
  return rows
}

export async function findProvider(
  tenantId: Id,
  id: Id,
): Promise<LlmProvider | null> {
  const { rows } = await pool.query<LlmProvider>(
    `SELECT ${PROVIDER_COLS} FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function getProviderSecret(
  tenantId: Id,
  id: Id,
): Promise<LlmProviderSecret | null> {
  const { rows } = await pool.query<{
    baseUrl: string
    apiKeyIv: Buffer
    apiKeyTag: Buffer
    apiKeyCiphertext: Buffer
    temperature: number | null
    topP: number | null
    maxTokens: number | null
    presencePenalty: number | null
    frequencyPenalty: number | null
  }>(
    `SELECT base_url AS "baseUrl",
            api_key_iv AS "apiKeyIv",
            api_key_tag AS "apiKeyTag",
            api_key_ciphertext AS "apiKeyCiphertext",
            temperature, top_p AS "topP", max_tokens AS "maxTokens",
            presence_penalty AS "presencePenalty", frequency_penalty AS "frequencyPenalty"
       FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  if (!rows[0]) return null
  const { decryptSecret } = await import('./crypto.js')
  const apiKey = decryptSecret({
    iv: rows[0].apiKeyIv,
    tag: rows[0].apiKeyTag,
    ciphertext: rows[0].apiKeyCiphertext,
  })
  return {
    baseUrl: rows[0].baseUrl,
    apiKey,
    temperature: rows[0].temperature ?? 0.7,
    topP: rows[0].topP ?? 1.0,
    maxTokens: rows[0].maxTokens ?? 2048,
    presencePenalty: rows[0].presencePenalty ?? 0,
    frequencyPenalty: rows[0].frequencyPenalty ?? 0,
  }
}

export async function insertProvider(input: {
  tenantId: Id
  name: string
  baseUrl: string
  apiKey: string
  apiKeyMasked: string
  defaultChatModel: string
  defaultEmbeddingModel: string | null
  isDefault: boolean
  isDefaultEmbedding?: boolean
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
}): Promise<LlmProvider> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = encryptSecret(input.apiKey)
  const { rows } = await pool.query<LlmProvider>(
    `INSERT INTO llm_providers
       (tenant_id, name, base_url, api_key_iv, api_key_tag, api_key_ciphertext,
        api_key_masked, default_chat_model, default_embedding_model, is_default, is_default_embedding,
        temperature, top_p, max_tokens, presence_penalty, frequency_penalty)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING ${PROVIDER_COLS}`,
    [
      input.tenantId,
      input.name,
      input.baseUrl,
      enc.iv,
      enc.tag,
      enc.ciphertext,
      input.apiKeyMasked,
      input.defaultChatModel,
      input.defaultEmbeddingModel,
      input.isDefault,
      input.isDefaultEmbedding ?? false,
      input.temperature ?? 0.7,
      input.topP ?? 1.0,
      input.maxTokens ?? 2048,
      input.presencePenalty ?? 0,
      input.frequencyPenalty ?? 0,
    ],
  )
  return rows[0]
}

export async function updateProvider(input: {
  tenantId: Id
  id: Id
  name?: string
  baseUrl?: string
  apiKey?: string
  apiKeyMasked?: string
  defaultChatModel?: string
  defaultEmbeddingModel?: string | null
  isDefault?: boolean
  isDefaultEmbedding?: boolean
  temperature?: number
  topP?: number
  maxTokens?: number
  presencePenalty?: number
  frequencyPenalty?: number
}): Promise<LlmProvider | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${i++}`)
    vals.push(v)
  }
  if (input.name !== undefined) push('name', input.name)
  if (input.baseUrl !== undefined) push('base_url', input.baseUrl)
  if (input.defaultChatModel !== undefined) push('default_chat_model', input.defaultChatModel)
  if (input.defaultEmbeddingModel !== undefined) push('default_embedding_model', input.defaultEmbeddingModel)
  if (input.isDefaultEmbedding !== undefined) push('is_default_embedding', input.isDefaultEmbedding)
  if (input.temperature !== undefined) push('temperature', input.temperature)
  if (input.topP !== undefined) push('top_p', input.topP)
  if (input.maxTokens !== undefined) push('max_tokens', input.maxTokens)
  if (input.presencePenalty !== undefined) push('presence_penalty', input.presencePenalty)
  if (input.frequencyPenalty !== undefined) push('frequency_penalty', input.frequencyPenalty)
  if (input.apiKey !== undefined) {
    const { encryptSecret } = await import('./crypto.js')
    const enc = encryptSecret(input.apiKey)
    push('api_key_iv', enc.iv)
    push('api_key_tag', enc.tag)
    push('api_key_ciphertext', enc.ciphertext)
    if (input.apiKeyMasked !== undefined) push('api_key_masked', input.apiKeyMasked)
  }
  if (sets.length === 0) return findProvider(input.tenantId, input.id)
  sets.push('updated_at = now()')
  vals.push(input.tenantId, input.id)
  const { rows } = await pool.query<LlmProvider>(
    `UPDATE llm_providers SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING ${PROVIDER_COLS}`,
    vals,
  )
  return rows[0] ?? null
}

export async function deleteProvider(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM llm_providers WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/**
 * Mark a provider as default for its tenant. Uses a transaction so the
 * partial unique index `uniq_llm_providers_default_per_tenant` is honored
 * (clear others, then set the target).
 */
export async function setDefaultProvider(tenantId: Id, id: Id): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE llm_providers SET is_default = false, updated_at = now() WHERE tenant_id = $1`,
      [tenantId],
    )
    await client.query(
      `UPDATE llm_providers SET is_default = true, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function setDefaultEmbeddingProvider(tenantId: Id, id: Id): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE llm_providers SET is_default_embedding = false, updated_at = now() WHERE tenant_id = $1`,
      [tenantId],
    )
    await client.query(
      `UPDATE llm_providers SET is_default_embedding = true, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) return bcrypt.compare(password, stored)
  console.error('[auth] stored password is not bcrypt hash, login rejected for safety')
  return false
}

export async function setUserPassword(userId: Id, plain: string): Promise<void> {
  const hashed = await hashPassword(plain)
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId])
}

export async function findUserByEmailAndPassword(
  email: string,
  password: string,
): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  const user = rows[0]
  if (!user) return null
  const ok = await verifyPassword(password, user.password)
  if (!ok) return null
  if (!user.password.startsWith('$2')) {
    const hashed = await hashPassword(password)
    await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [user.id, hashed])
    user.password = hashed
  }
  return user
}

export async function findUserById(id: Id): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, email, password, created_at AS "createdAt" FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  return rows[0] ?? null
}

export async function createUser(email: string, hashedPassword: string): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, password, created_at AS "createdAt"`,
    [email.toLowerCase(), hashedPassword],
  )
  return rows[0]
}

/* ---------- tenants ---------- */

export async function createTenant(name: string): Promise<Tenant> {
  const { rows } = await pool.query<Tenant>(
    `INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"`,
    [name],
  )
  return rows[0]
}

export async function listTenantsForUser(userId: Id): Promise<Tenant[]> {
  const { rows } = await pool.query<Tenant>(
    `SELECT t.id, t.name, t.created_at AS "createdAt"
       FROM tenants t
       JOIN memberships m ON m.tenant_id = t.id
      WHERE m.user_id = $1`,
    [userId],
  )
  return rows
}

export async function findTenantById(id: Id): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>(
    `SELECT id, name, created_at AS "createdAt" FROM tenants WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/* ---------- memberships ---------- */

export async function findFirstMembershipForUser(
  userId: Id,
): Promise<Membership | null> {
  const { rows } = await pool.query<Membership>(
    `SELECT id, tenant_id AS "tenantId", user_id AS "userId", role
       FROM memberships WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function listMembershipsForUser(
  userId: Id,
): Promise<Membership[]> {
  const { rows } = await pool.query<Membership>(
    `SELECT id, tenant_id AS "tenantId", user_id AS "userId", role
       FROM memberships WHERE user_id = $1`,
    [userId],
  )
  return rows
}

/* ---------- platform: cross-tenant queries ---------- */

export type TenantWithWallet = {
  id: Id
  name: string
  createdAt: string
  balance: number
  monthRechargeYuan: number
  monthConsumeYuan: number
  monthTokens: number
  activeUsers30d: number
}

export async function listTenantsWithWallet(): Promise<TenantWithWallet[]> {
  const { rows } = await pool.query<TenantWithWallet>(
    `SELECT
       t.id, t.name, t.created_at AS "createdAt",
       COALESCE(w.balance, 0)::float8 AS balance,
       COALESCE(rr.month_recharge, 0)::float8 AS "monthRechargeYuan",
       COALESCE(rc.month_consume, 0)::float8 AS "monthConsumeYuan",
       COALESCE(mt.month_tokens, 0)::bigint::int AS "monthTokens",
       COALESCE(au.active_users, 0)::int AS "activeUsers30d"
     FROM tenants t
     LEFT JOIN tenant_wallets w ON w.tenant_id = t.id
     LEFT JOIN (
       SELECT tenant_id, SUM(amount_yuan)::float8 AS month_recharge
         FROM recharge_orders
        WHERE status = 'paid'
          AND paid_at >= date_trunc('month', NOW())
        GROUP BY tenant_id
     ) rr ON rr.tenant_id = t.id
     LEFT JOIN (
       SELECT tenant_id, SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)::float8 AS month_consume
         FROM wallet_transactions
        WHERE created_at >= date_trunc('month', NOW())
          AND kind IN ('llm_charge', 'admin_adjust')
        GROUP BY tenant_id
     ) rc ON rc.tenant_id = t.id
     LEFT JOIN (
       SELECT tenant_id, SUM(total_tokens)::bigint AS month_tokens
         FROM llm_usage
        WHERE created_at >= date_trunc('month', NOW())
        GROUP BY tenant_id
     ) mt ON mt.tenant_id = t.id
     LEFT JOIN (
       SELECT m.tenant_id, COUNT(DISTINCT s.user_id)::int AS active_users
         FROM memberships m
         JOIN sessions s ON s.user_id = m.user_id
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY m.tenant_id
     ) au ON au.tenant_id = t.id
     ORDER BY t.created_at DESC`,
  )
  return rows
}

export type PlatformOverview = {
  totalTenants: number
  activeTenants30d: number
  totalBalanceYuan: number
  monthRechargeYuan: number
  monthConsumeYuan: number
  monthNewTenants: number
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const { rows } = await pool.query<PlatformOverview>(
    `SELECT
       (SELECT COUNT(*)::int FROM tenants) AS "totalTenants",
       (SELECT COUNT(DISTINCT m.tenant_id)::int
          FROM memberships m
          JOIN sessions s ON s.user_id = m.user_id
         WHERE s.created_at >= NOW() - INTERVAL '30 days') AS "activeTenants30d",
       COALESCE((SELECT SUM(balance)::float8 FROM tenant_wallets), 0) AS "totalBalanceYuan",
       COALESCE((SELECT SUM(amount_yuan)::float8
                   FROM recharge_orders
                  WHERE status = 'paid'
                    AND paid_at >= date_trunc('month', NOW())), 0) AS "monthRechargeYuan",
       COALESCE((SELECT SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)::float8
                   FROM wallet_transactions
                  WHERE created_at >= date_trunc('month', NOW())
                    AND kind IN ('llm_charge', 'admin_adjust')), 0) AS "monthConsumeYuan",
       (SELECT COUNT(*)::int FROM tenants WHERE created_at >= date_trunc('month', NOW())) AS "monthNewTenants"
    `,
  )
  return rows[0]
}

export async function recordPlatformLoginAttempt(input: {
  identifier: string
  ip: string
  success: boolean
  userId?: string
}): Promise<void> {
  await pool.query(
    `INSERT INTO platform_login_attempts (identifier, ip, success, user_id)
     VALUES ($1, $2, $3, $4)`,
    [input.identifier, input.ip, input.success, input.userId ?? null],
  )
}

export async function listAllRechargeOrders(
  limit: number = 50,
  offset: number = 0,
): Promise<Array<{
  orderNo: string
  tenantId: Id
  tenantName: string
  amountYuan: number
  status: string
  channel: string
  createdAt: string
  paidAt: string | null
}>> {
  const { rows } = await pool.query<{
    orderNo: string; tenantId: Id; tenantName: string;
    amountYuan: number; status: string; channel: string;
    createdAt: string; paidAt: string | null;
  }>(
    `SELECT ro.order_no AS "orderNo",
            ro.tenant_id AS "tenantId",
            t.name AS "tenantName",
            ro.amount_yuan::float8 AS "amountYuan",
            ro.status, ro.channel,
            ro.created_at AS "createdAt",
            ro.paid_at AS "paidAt"
       FROM recharge_orders ro
       JOIN tenants t ON t.id = ro.tenant_id
       ORDER BY ro.created_at DESC
       LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return rows
}

export async function listAllWalletTransactions(
  limit: number = 50,
  offset: number = 0,
): Promise<Array<{
  id: Id
  tenantId: Id
  tenantName: string
  kind: string
  amountYuan: number
  balanceAfter: number | null
  refType: string | null
  refId: string | null
  remark: string | null
  createdAt: string
}>> {
  const { rows } = await pool.query<{
    id: Id; tenantId: Id; tenantName: string;
    kind: string; amountYuan: number; balanceAfter: number | null;
    refType: string | null; refId: string | null; remark: string | null;
    createdAt: string;
  }>(
    `SELECT wt.id, wt.tenant_id AS "tenantId", t.name AS "tenantName",
            wt.kind, wt.amount::float8 AS "amountYuan",
            wt.balance_after::float8 AS "balanceAfter",
            wt.ref_type AS "refType", wt.ref_id AS "refId",
            wt.remark, wt.created_at AS "createdAt"
       FROM wallet_transactions wt
       JOIN tenants t ON t.id = wt.tenant_id
       ORDER BY wt.created_at DESC
       LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return rows
}

export async function createMembership(input: {
  tenantId: Id; userId: Id; role: Membership['role']
}): Promise<Membership> {
  const { rows } = await pool.query<Membership>(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
     RETURNING id, tenant_id AS "tenantId", user_id AS "userId", role`,
    [input.tenantId, input.userId, input.role],
  )
  return rows[0]
}

/* ---------- sessions ---------- */

export async function createSession(
  token: string,
  userId: Id,
  tenantId: Id,
  kind: 'tenant' | 'platform' = 'tenant',
): Promise<void> {
  await pool.query(
    `INSERT INTO sessions (token, user_id, tenant_id, kind, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
    [token, userId, tenantId, kind],
  )
}

export async function getSession(token: string): Promise<TokenSession | null> {
  const { rows } = await pool.query<TokenSession>(
    `SELECT token, user_id AS "userId", tenant_id AS "tenantId",
            created_at AS "createdAt",
            COALESCE(kind, 'tenant') AS kind
       FROM sessions WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [token],
  )
  return rows[0] ?? null
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token])
}

export async function deleteAllSessionsForUser(userId: Id): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId])
}

/* ---------- workflows ---------- */

export async function listWorkflows(tenantId: Id, opts?: { createdBy?: Id }): Promise<Workflow[]> {
  const conds = ['tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts?.createdBy) {
    conds.push(`created_by = $${i++}`)
    vals.push(opts.createdBy)
  }
  const { rows } = await pool.query<Workflow>(
    `SELECT id, tenant_id AS "tenantId", name, status, created_by AS "createdBy",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workflows WHERE ${conds.join(' AND ')}
       ORDER BY updated_at DESC`,
    vals,
  )
  return rows
}

export async function findWorkflow(
  tenantId: Id,
  id: Id,
): Promise<Workflow | null> {
  const { rows } = await pool.query<Workflow>(
    `SELECT id, tenant_id AS "tenantId", name, status,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function createWorkflow(
  tenantId: Id,
  name: string,
  opts?: { createdBy?: Id },
): Promise<Workflow> {
  const { rows } = await pool.query<Workflow>(
    `INSERT INTO workflows (tenant_id, name, status, created_by)
     VALUES ($1, $2, 'draft', $3)
     RETURNING id, tenant_id AS "tenantId", name, status, created_by AS "createdBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, opts?.createdBy ?? null],
  )
  return rows[0]
}

const WF_COLS = `
  id, tenant_id AS "tenantId", name, status, definition,
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function findWorkflowWithDefinition(
  tenantId: Id,
  id: Id,
): Promise<Workflow | null> {
  const { rows } = await pool.query<Workflow>(
    `SELECT ${WF_COLS} FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  const row = rows[0]
  if (!row) return null
  if (typeof row.definition === 'string') {
    row.definition = JSON.parse(row.definition)
  }
  return row
}

export async function updateWorkflow(
  tenantId: Id,
  id: Id,
  patch: { name?: string; status?: Workflow['status']; definition?: WorkflowDefinition },
): Promise<Workflow | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`)
    vals.push(patch.name)
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`)
    vals.push(patch.status)
  }
  if (patch.definition !== undefined) {
    sets.push(`definition = $${i++}`)
    vals.push(JSON.stringify(patch.definition))
  }
  if (sets.length === 0) return findWorkflowWithDefinition(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<Workflow>(
    `UPDATE workflows SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING ${WF_COLS}`,
    vals,
  )
  const row = rows[0]
  if (row && typeof row.definition === 'string') {
    row.definition = JSON.parse(row.definition)
  }
  return row ?? null
}

export async function listPublishedWorkflows(tenantId: Id): Promise<Workflow[]> {
  const { rows } = await pool.query<Workflow>(
    `SELECT ${WF_COLS} FROM workflows
      WHERE tenant_id = $1 AND status = 'published'
      ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows.map((row) => {
    if (typeof row.definition === 'string') {
      row.definition = JSON.parse(row.definition)
    }
    return row
  })
}

/* ---------- executions ---------- */

export async function createExecution(input: {
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData?: unknown
  parentExecutionId?: Id
  createdBy?: Id
}): Promise<Execution> {
  const { rows } = await pool.query<Execution>(
    `INSERT INTO executions (tenant_id, workflow_id, status, trigger_type, trigger_data, parent_execution_id, created_by)
     VALUES ($1, $2, 'running', $3, $4, $5, $6)
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId", created_by AS "createdBy",
               status, trigger_type AS "triggerType", trigger_data AS "triggerData",
               error, started_at AS "startedAt", finished_at AS "finishedAt"`,
    [input.tenantId, input.workflowId, input.triggerType, input.triggerData ?? null, input.parentExecutionId ?? null, input.createdBy ?? null],
  )
  return rows[0]
}

export async function finishExecution(
  id: Id,
  status: Execution['status'],
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE executions SET status = $2, error = $3, finished_at = now() WHERE id = $1`,
    [id, status, error],
  )
}

export async function createExecutionStep(input: {
  executionId: Id
  nodeId: string
  nodeType: string
  nodeLabel: string
  input?: unknown
}): Promise<ExecutionStep> {
  const { rows } = await pool.query<ExecutionStep>(
    `INSERT INTO execution_steps
       (execution_id, node_id, node_type, node_label, status, input)
     VALUES ($1, $2, $3, $4, 'running', $5)
     RETURNING id, execution_id AS "executionId", node_id AS "nodeId",
               node_type AS "nodeType", node_label AS "nodeLabel", status,
               input, output, error,
               started_at AS "startedAt", finished_at AS "finishedAt"`,
    [input.executionId, input.nodeId, input.nodeType, input.nodeLabel, input.input ?? null],
  )
  return rows[0]
}

export async function finishExecutionStep(
  id: Id,
  status: ExecutionStep['status'],
  output: unknown,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE execution_steps SET status = $2, output = $3, error = $4, finished_at = now() WHERE id = $1`,
    [id, status, output ?? null, error],
  )
}

export async function listExecutions(
  tenantId: Id,
  opts?: { workflowId?: Id; status?: string; limit?: number; createdBy?: Id },
): Promise<Execution[]> {
  const conds = ['e.tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts?.workflowId) {
    conds.push(`e.workflow_id = $${i++}`)
    vals.push(opts.workflowId)
  }
  if (opts?.status) {
    conds.push(`e.status = $${i++}`)
    vals.push(opts.status)
  }
  if (opts?.createdBy) {
    conds.push(`e.created_by = $${i++}`)
    vals.push(opts.createdBy)
  }
  const limit = Math.min(opts?.limit ?? 50, 200)
  vals.push(limit)
  const { rows } = await pool.query<Execution>(
    `SELECT e.id, e.tenant_id AS "tenantId", e.workflow_id AS "workflowId",
            w.name AS "workflowName", e.status, e.trigger_type AS "triggerType",
            e.trigger_data AS "triggerData", e.error,
            e.parent_execution_id AS "parentExecutionId",
            e.created_by AS "createdBy",
            e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE ${conds.join(' AND ')}
      ORDER BY e.started_at DESC
      LIMIT $${i}`,
    vals,
  )
  return rows
}

export async function listChildExecutions(
  tenantId: Id,
  parentExecutionId: Id,
): Promise<ChildExecution[]> {
  const { rows } = await pool.query<ChildExecution>(
    `SELECT e.id, e.tenant_id AS "tenantId", e.workflow_id AS "workflowId",
            w.name AS "workflowName", e.status, e.trigger_type AS "triggerType",
            e.error, e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE e.tenant_id = $1 AND e.parent_execution_id = $2
      ORDER BY e.started_at ASC`,
    [tenantId, parentExecutionId],
  )
  return rows
}

export async function findExecution(
  tenantId: Id,
  id: Id,
): Promise<Execution | null> {
  const { rows } = await pool.query<Execution>(
    `SELECT e.id, e.tenant_id AS "tenantId", e.workflow_id AS "workflowId",
            w.name AS "workflowName", e.status, e.trigger_type AS "triggerType",
            e.trigger_data AS "triggerData", e.error,
            e.parent_execution_id AS "parentExecutionId",
            e.started_at AS "startedAt", e.finished_at AS "finishedAt"
       FROM executions e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE e.tenant_id = $1 AND e.id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function listExecutionSteps(executionId: Id): Promise<ExecutionStep[]> {
  const { rows } = await pool.query<ExecutionStep>(
    `SELECT id, execution_id AS "executionId", node_id AS "nodeId",
            node_type AS "nodeType", node_label AS "nodeLabel", status,
            input, output, error,
            started_at AS "startedAt", finished_at AS "finishedAt"
       FROM execution_steps
      WHERE execution_id = $1
      ORDER BY started_at ASC`,
    [executionId],
  )
  return rows
}

/* ---------- knowledge ---------- */

function chunkText(text: string, strategy: string | 'fixed' | 'semantic' | 'paragraph' = 'fixed', size = 500, overlap = 50, separator = '\n\n'): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  if (strategy === 'paragraph') {
    // 按段落分块（用指定分隔符）
    const parts = clean.split(separator).filter(Boolean)
    const chunks: string[] = []
    let current = ''
    for (const part of parts) {
      if (current.length + part.length > size && current.length > 0) {
        chunks.push(current.trim())
        current = part
      } else {
        current += (current ? separator : '') + part
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return applyOverlap(chunks, overlap)
  }

  if (strategy === 'semantic') {
    // 按语义分块（基于句子完整性）
    const paragraphs = clean.split(/\n{2,}/).filter(Boolean)
    const chunks: string[] = []
    for (const para of paragraphs) {
      if (para.length <= size) {
        chunks.push(para)
        continue
      }
      // 按句子拆分
      const sentences = para.split(/(?<=[。！？.!?\n])\s*/).filter(Boolean)
      let current = ''
      for (const s of sentences) {
        if ((current + s).length > size && current.length > 100) {
          chunks.push(current.trim())
          current = s
        } else {
          current += s
        }
      }
      if (current.trim()) chunks.push(current.trim())
    }
    return applyOverlap(chunks, overlap)
  }

  // fixed（默认）：固定大小分块
  const paragraphs = clean.split(/\n{2,}/).filter(Boolean)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= size) {
      chunks.push(para)
      continue
    }

    const sentences = para.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
    let current = ''
    for (const s of sentences) {
      if (current.length + s.length > size && current.length > 0) {
        chunks.push(current.trim())
        current = s
      } else {
        current += (current ? '' : '') + s
      }
    }
    if (current.trim()) chunks.push(current.trim())
  }
  return applyOverlap(chunks, overlap)
}

function applyOverlap(chunks: string[], overlap: number): string[] {
  if (overlap <= 0 || chunks.length <= 1) return chunks
  const overlapped: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prev = overlapped[overlapped.length - 1]
    const next = chunks[i]
    const overlapText = prev.slice(-overlap)
    overlapped.push(overlapText + next)
  }
  return overlapped
}

export async function listKnowledgeBases(tenantId: Id): Promise<KnowledgeBase[]> {
  const { rows } = await pool.query<KnowledgeBase>(
    `SELECT kb.id, kb.tenant_id AS "tenantId", kb.name, kb.description,
            COUNT(DISTINCT d.id)::int AS "documentCount",
            COUNT(c.id)::int AS "chunkCount",
            COUNT(c.id) FILTER (WHERE c.embedding_json IS NOT NULL)::int AS "vectorizedChunkCount",
            kb.chunk_strategy AS "chunkStrategy", kb.chunk_size AS "chunkSize",
            kb.chunk_overlap AS "chunkOverlap", kb.separator,
            kb.created_at AS "createdAt", kb.updated_at AS "updatedAt"
       FROM knowledge_bases kb
       LEFT JOIN knowledge_documents d ON d.kbase_id = kb.id
       LEFT JOIN knowledge_chunks c ON c.kbase_id = kb.id
      WHERE kb.tenant_id = $1
      GROUP BY kb.id
      ORDER BY kb.updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createKnowledgeBase(
  tenantId: Id,
  name: string,
  description?: string,
  chunkStrategy?: string,
  chunkSize?: number,
  chunkOverlap?: number,
  separator?: string,
): Promise<KnowledgeBase> {
  const { rows } = await pool.query<KnowledgeBase>(
    `INSERT INTO knowledge_bases (tenant_id, name, description, chunk_strategy, chunk_size, chunk_overlap, separator)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tenant_id AS "tenantId", name, description,
               chunk_strategy AS "chunkStrategy", chunk_size AS "chunkSize",
               chunk_overlap AS "chunkOverlap", separator,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, description ?? null, chunkStrategy ?? 'fixed', chunkSize ?? 500, chunkOverlap ?? 50, separator ?? '\n\n'],
  )
  return rows[0]
}

export async function findKnowledgeBase(tenantId: Id, id: Id): Promise<KnowledgeBase | null> {
  const { rows } = await pool.query<KnowledgeBase>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            chunk_strategy AS "chunkStrategy", chunk_size AS "chunkSize",
            chunk_overlap AS "chunkOverlap", separator,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_bases WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function updateKnowledgeBase(
  tenantId: Id,
  id: Id,
  input: { name?: string; description?: string; chunkStrategy?: string; chunkSize?: number; chunkOverlap?: number; separator?: string },
): Promise<KnowledgeBase | null> {
  const sets: string[] = ['updated_at = now()']
  const vals: unknown[] = [tenantId, id]
  let i = 3
  if (input.name !== undefined) { sets.push(`name = $${i++}`); vals.push(input.name) }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); vals.push(input.description) }
  if (input.chunkStrategy !== undefined) { sets.push(`chunk_strategy = $${i++}`); vals.push(input.chunkStrategy) }
  if (input.chunkSize !== undefined) { sets.push(`chunk_size = $${i++}`); vals.push(input.chunkSize) }
  if (input.chunkOverlap !== undefined) { sets.push(`chunk_overlap = $${i++}`); vals.push(input.chunkOverlap) }
  if (input.separator !== undefined) { sets.push(`separator = $${i++}`); vals.push(input.separator) }
  if (sets.length === 1) return findKnowledgeBase(tenantId, id)
  const { rows } = await pool.query<KnowledgeBase>(
    `UPDATE knowledge_bases SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id AS "tenantId", name, description,
               chunk_strategy AS "chunkStrategy", chunk_size AS "chunkSize",
               chunk_overlap AS "chunkOverlap", separator,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    vals,
  )
  return rows[0] ?? null
}

export async function deleteKnowledgeBase(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_bases WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function getKbChunkConfig(tenantId: Id, kbaseId: Id): Promise<{ strategy: string; chunkSize: number; chunkOverlap: number; separator: string }> {
  const kb = await findKnowledgeBase(tenantId, kbaseId)
  if (!kb) throw new Error('知识库不存在')
  return {
    strategy: kb.chunkStrategy ?? 'fixed',
    chunkSize: kb.chunkSize ?? 500,
    chunkOverlap: kb.chunkOverlap ?? 50,
    separator: kb.separator ?? '\n\n',
  }
}

export async function listKnowledgeDocuments(
  tenantId: Id,
  kbaseId: Id,
): Promise<KnowledgeDocument[]> {
  const { rows } = await pool.query<KnowledgeDocument>(
    `SELECT id, kbase_id AS "kbaseId", tenant_id AS "tenantId",
            title, source_type AS "sourceType", content,
            created_at AS "createdAt"
       FROM knowledge_documents
      WHERE tenant_id = $1 AND kbase_id = $2
      ORDER BY created_at DESC`,
    [tenantId, kbaseId],
  )
  return rows
}

export async function addKnowledgeDocument(
  tenantId: Id,
  kbaseId: Id,
  title: string,
  content: string,
  sourceType = 'text',
): Promise<KnowledgeDocument> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const docRes = await client.query<KnowledgeDocument>(
      `INSERT INTO knowledge_documents (kbase_id, tenant_id, title, source_type, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kbase_id AS "kbaseId", tenant_id AS "tenantId",
                 title, source_type AS "sourceType", content,
                 created_at AS "createdAt"`,
      [kbaseId, tenantId, title, sourceType, content],
    )
    const doc = docRes.rows[0]
    // 获取知识库分块配置
    const kbConfig = await getKbChunkConfig(tenantId, kbaseId)
    const parts = chunkText(content, kbConfig.strategy, kbConfig.chunkSize, kbConfig.chunkOverlap, kbConfig.separator)
    for (let idx = 0; idx < parts.length; idx++) {
      await client.query(
        `INSERT INTO knowledge_chunks (document_id, kbase_id, tenant_id, idx, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [doc.id, kbaseId, tenantId, idx, parts[idx]],
      )
    }
    await client.query(
      `UPDATE knowledge_bases SET updated_at = now() WHERE id = $1`,
      [kbaseId],
    )
    await client.query('COMMIT')
    return doc
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function searchKnowledgeChunks(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []
  const { rows } = await pool.query<KnowledgeChunkHit & { rank: number; idx: number; document_id: Id; source_type: string }>(
    `SELECT c.id, c.content, d.title, c.idx, c.document_id, d.source_type,
            ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', $3)) AS rank
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2
        AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $3)
      ORDER BY rank DESC
      LIMIT $4`,
    [tenantId, kbaseId, q, limit],
  )
  if (rows.length) {
    return rows.map((r) => {
      const full = String(r.content ?? '')
      const preview = full.length > 200 ? full.slice(0, 200) + '…' : full
      return {
        id: r.id,
        content: r.content,
        title: r.title,
        score: Number(r.rank) || 0,
        documentId: r.document_id,
        chunkIndex: r.idx,
        sourceType: r.source_type,
        preview,
      }
    })
  }
  const { rows: fallback } = await pool.query<KnowledgeChunkHit & { idx: number; document_id: Id; source_type: string }>(
    `SELECT c.id, c.content, d.title, c.idx, c.document_id, d.source_type, 0.1::float AS score
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.content ILIKE $3
      LIMIT $4`,
    [tenantId, kbaseId, `%${q}%`, limit],
  )
  return fallback.map((r) => {
    const full = String(r.content ?? '')
    const preview = full.length > 200 ? full.slice(0, 200) + '…' : full
    return {
      id: r.id,
      content: r.content,
      title: r.title,
      score: Number(r.score) || 0,
      documentId: r.document_id,
      chunkIndex: r.idx,
      sourceType: r.source_type,
      preview,
    }
  })
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function setChunkEmbedding(
  chunkId: Id,
  embedding: number[],
): Promise<void> {
  await pool.query(
    `UPDATE knowledge_chunks SET embedding_json = $2 WHERE id = $1`,
    [chunkId, JSON.stringify(embedding)],
  )
  try {
    const vec = `[${embedding.join(',')}]`
    await pool.query(`UPDATE knowledge_chunks SET embedding = $2::vector WHERE id = $1`, [chunkId, vec])
  } catch {
    /* pgvector column may not exist */
  }
}

export async function searchKnowledgeChunksVector(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const { createEmbedding } = await import('./engine/llm.js')
    const queryVec = await createEmbedding(tenantId, q)
    const vecStr = `[${queryVec.join(',')}]`
    const { rows } = await pool.query<KnowledgeChunkHit & { score: number }>(
      `SELECT c.id, c.content, d.title,
              1 - (c.embedding <=> $3::vector) AS score
         FROM knowledge_chunks c
         JOIN knowledge_documents d ON d.id = c.document_id
        WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $3::vector
        LIMIT $4`,
      [tenantId, kbaseId, vecStr, limit],
    )
    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        title: r.title,
        score: Number(r.score) || 0,
      }))
    }
  } catch {
    /* fall through to json cosine */
  }

  const { createEmbedding } = await import('./engine/llm.js')
  const queryVec = await createEmbedding(tenantId, q)
  const { rows } = await pool.query<{ id: string; content: string; title: string; embedding_json: number[] }>(
    `SELECT c.id, c.content, d.title, c.embedding_json
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1 AND c.kbase_id = $2 AND c.embedding_json IS NOT NULL`,
    [tenantId, kbaseId],
  )
  return rows
    .map((r) => {
      const emb = Array.isArray(r.embedding_json) ? r.embedding_json : []
      return {
        id: r.id,
        content: r.content,
        title: r.title,
        score: emb.length ? cosineSimilarity(queryVec, emb) : 0,
      }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function searchKnowledgeChunksHybrid(
  tenantId: Id,
  kbaseId: Id,
  query: string,
  limit = 5,
  vectorWeight = 0.7,
): Promise<KnowledgeChunkHit[]> {
  const q = query.trim()
  if (!q) return []

  const [vectorHits, keywordHits] = await Promise.all([
    searchKnowledgeChunksVector(tenantId, kbaseId, q, limit * 2).catch(() => []),
    searchKnowledgeChunks(tenantId, kbaseId, q, limit * 2),
  ])

  if (!vectorHits.length && !keywordHits.length) return []
  if (!vectorHits.length) return keywordHits.slice(0, limit)
  if (!keywordHits.length) return vectorHits.slice(0, limit)

  const scoreMap = new Map<string, { chunk: KnowledgeChunkHit; vector: number; keyword: number }>()
  const k = 60

  for (const [rank, hit] of vectorHits.entries()) {
    scoreMap.set(hit.id, { chunk: hit, vector: 1 / (k + rank + 1), keyword: 0 })
  }
  for (const [rank, hit] of keywordHits.entries()) {
    const entry = scoreMap.get(hit.id)
    if (entry) {
      entry.keyword = 1 / (k + rank + 1)
    } else {
      scoreMap.set(hit.id, { chunk: hit, vector: 0, keyword: 1 / (k + rank + 1) })
    }
  }

  return [...scoreMap.values()]
    .map(({ chunk, vector, keyword }) => ({
      ...chunk,
      score: vectorWeight * vector + (1 - vectorWeight) * keyword,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export type ExecutionJob = {
  id: Id
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData?: unknown
  status: 'pending' | 'processing' | 'done' | 'failed'
  executionId?: Id | null
  error?: string | null
  userId?: Id | null
  createdAt: string
  attemptCount: number
  maxAttempts: number
  nextAttemptAt?: string | null
  lastError?: string | null
  dedupKey?: string | null
  deadLetterReason?: string | null
}

export type WorkflowTriggerRow = {
  id: Id
  tenantId: Id
  workflowId: Id
  workflowName?: string
  nodeId: string
  type: 'webhook' | 'cron' | 'mes'
  config: Record<string, unknown>
  enabled: boolean
}

export async function enqueueExecutionJob(input: {
  tenantId: Id
  workflowId: Id
  triggerType: string
  triggerData: Record<string, unknown>
  userId?: Id
  dedupKey?: string
}): Promise<ExecutionJob> {
  // 幂等：同一 dedup_key 24h 内已入队则直接返回已存在 job（不重复入队）
  if (input.dedupKey) {
    const existing = await pool.query<ExecutionJob>(
      `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId",
              trigger_type AS "triggerType", trigger_data AS "triggerData",
              status, execution_id AS "executionId", error, user_id AS "userId",
              created_at AS "createdAt", attempt_count AS "attemptCount",
              max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt",
              last_error AS "lastError", dedup_key AS "dedupKey",
              dead_letter_reason AS "deadLetterReason"
         FROM execution_jobs
        WHERE tenant_id = $1 AND dedup_key = $2
          AND created_at >= now() - interval '24 hours'
          AND status IN ('pending','processing')
        LIMIT 1`,
      [input.tenantId, input.dedupKey],
    )
    if (existing.rows[0]) return existing.rows[0]
  }

  const { rows } = await pool.query<ExecutionJob>(
    `INSERT INTO execution_jobs (tenant_id, workflow_id, trigger_type, trigger_data, user_id, dedup_key, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
               trigger_type AS "triggerType", trigger_data AS "triggerData",
               status, execution_id AS "executionId", error, user_id AS "userId",
               created_at AS "createdAt", attempt_count AS "attemptCount",
               max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt",
               last_error AS "lastError", dedup_key AS "dedupKey",
               dead_letter_reason AS "deadLetterReason"`,
    [input.tenantId, input.workflowId, input.triggerType, input.triggerData, input.userId ?? null, input.dedupKey ?? null, Number(process.env.JOB_MAX_ATTEMPTS ?? '3')],
  )
  // 极端并发下 ON CONFLICT 未插入（仅可能发生在有 dedupKey 时）：回查并返回已存在任务
  if (!rows[0]) {
    if (input.dedupKey) {
      const { rows: existingRows } = await pool.query<ExecutionJob>(
        `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId",
                trigger_type AS "triggerType", trigger_data AS "triggerData",
                status, execution_id AS "executionId", error, user_id AS "userId",
                created_at AS "createdAt", attempt_count AS "attemptCount",
                max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt",
                last_error AS "lastError", dedup_key AS "dedupKey",
                dead_letter_reason AS "deadLetterReason"
           FROM execution_jobs WHERE tenant_id = $1 AND dedup_key = $2 AND status = 'pending' LIMIT 1`,
        [input.tenantId, input.dedupKey],
      )
      const fallback = existingRows[0]
      if (fallback) return fallback
    }
    throw new Error('failed to enqueue execution job')
  }
  const job = rows[0]
  void redisPushJob(job.id).catch(() => {})
  return job
}

export async function claimExecutionJobById(id: Id): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `UPDATE execution_jobs SET status = 'processing', started_at = now(),
        attempt_count = attempt_count + 1
      WHERE id = $1
        AND status = 'pending'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
                trigger_type AS "triggerType", trigger_data AS "triggerData",
                status, execution_id AS "executionId", error, user_id AS "userId",
                created_at AS "createdAt", attempt_count AS "attemptCount",
                max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt",
                last_error AS "lastError", dedup_key AS "dedupKey",
                dead_letter_reason AS "deadLetterReason"`,
    [id],
  )
  return rows[0] ?? null
}

export async function findExecutionJob(tenantId: Id, id: Id): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId",
            trigger_type AS "triggerType", trigger_data AS "triggerData",
            status, execution_id AS "executionId", error, user_id AS "userId",
            created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt"
       FROM execution_jobs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function cancelExecution(tenantId: Id, executionId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE executions SET status = 'cancelled', error = '用户取消', finished_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'running'`,
    [tenantId, executionId],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteWorkflow(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM workflows WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function claimExecutionJob(): Promise<ExecutionJob | null> {
  const { rows } = await pool.query<ExecutionJob>(
    `UPDATE execution_jobs SET status = 'processing', started_at = now(),
        attempt_count = attempt_count + 1
      WHERE id = (
        SELECT id FROM execution_jobs
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId",
                trigger_type AS "triggerType", trigger_data AS "triggerData",
                status, execution_id AS "executionId", error, user_id AS "userId",
                created_at AS "createdAt", attempt_count AS "attemptCount",
                max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt",
                last_error AS "lastError", dedup_key AS "dedupKey",
                dead_letter_reason AS "deadLetterReason"`,
  )
  return rows[0] ?? null
}

export async function finishExecutionJob(
  id: Id,
  status: 'done' | 'failed',
  executionId: Id | null,
  error: string | null,
): Promise<'done' | 'retrying' | 'dead-letter'> {
  // 成功：直接完成并清除退避
  if (status === 'done') {
    await pool.query(
      `UPDATE execution_jobs SET status = 'done', execution_id = $2, error = NULL,
          last_error = NULL, next_attempt_at = NULL, finished_at = now()
        WHERE id = $1`,
      [id, executionId],
    )
    return 'done'
  }

  // 失败：读取当前 attempt（claim 时已 +1）与 max_attempts，决定重试或死信
  const { rows } = await pool.query<ExecutionJob>(
    `SELECT attempt_count AS "attemptCount", max_attempts AS "maxAttempts",
            tenant_id AS "tenantId", workflow_id AS "workflowId", trigger_data AS "triggerData"
       FROM execution_jobs WHERE id = $1`,
    [id],
  )
  const job = rows[0]
  if (!job) return 'done'

  if (job.attemptCount < job.maxAttempts) {
    // 指数退避：1s → 4s → 16s …（attempt 从 1 起）
    const delayMs = Math.min(2 ** (job.attemptCount - 1) * 1000, 60_000)
    await pool.query(
      `UPDATE execution_jobs SET status = 'pending', error = $2,
          last_error = $2, next_attempt_at = now() + make_interval(secs => $3),
          execution_id = NULL, finished_at = NULL
        WHERE id = $1`,
      [id, error, delayMs / 1000],
    )
    // 重试任务回到 Redis 队列，保证 processOne 能再次捞取（否则只会被 fallback 扫描碰到）
    void redisPushJob(id).catch(() => {})
    return 'retrying'
  }

  // 超限：置 failed 并写入死信表
  await pool.query(
    `UPDATE execution_jobs SET status = 'failed', error = $2,
        last_error = $2, dead_letter_reason = $2, finished_at = now()
      WHERE id = $1`,
    [id, error],
  )
  await pool.query(
    `INSERT INTO dead_letters (job_id, tenant_id, workflow_id, reason, payload, error)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, job.tenantId, job.workflowId, 'max_attempts_exceeded', job.triggerData ?? {}, error],
  )
  return 'dead-letter'
}

export async function clearWorkflowTriggers(tenantId: Id, workflowId: Id): Promise<void> {
  await pool.query(
    `DELETE FROM workflow_triggers WHERE tenant_id = $1 AND workflow_id = $2`,
    [tenantId, workflowId],
  )
}

export async function upsertWorkflowTrigger(input: {
  tenantId: Id
  workflowId: Id
  nodeId: string
  type: 'webhook' | 'cron' | 'mes'
  config: Record<string, unknown>
}): Promise<void> {
  await pool.query(
    `INSERT INTO workflow_triggers (tenant_id, workflow_id, node_id, type, config)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, workflow_id, node_id) DO UPDATE
       SET type = EXCLUDED.type, config = EXCLUDED.config, enabled = true`,
    [input.tenantId, input.workflowId, input.nodeId, input.type, input.config],
  )
}

export async function listAllCronTriggers(): Promise<WorkflowTriggerRow[]> {
  const { rows } = await pool.query<WorkflowTriggerRow>(
    `SELECT wt.id, wt.tenant_id AS "tenantId", wt.workflow_id AS "workflowId",
            w.name AS "workflowName",
            wt.node_id AS "nodeId", wt.type, wt.config, wt.enabled
       FROM workflow_triggers wt
       JOIN workflows w ON w.id = wt.workflow_id AND w.status = 'published'
      WHERE wt.type = 'cron' AND wt.enabled = true`,
  )
  return rows
}

export async function findWorkflowByWebhook(
  tenantId: Id,
  path: string,
) : Promise<{ workflowId: Id; nodeId: string; config?: Record<string, unknown> } | null> {
  const { rows } = await pool.query<{ workflowId: Id; nodeId: string; config?: Record<string, unknown> }>(
    `SELECT wt.workflow_id AS "workflowId", wt.node_id AS "nodeId", wt.config
       FROM workflow_triggers wt
       JOIN workflows w ON w.id = wt.workflow_id AND w.status = 'published'
      WHERE wt.tenant_id = $1 AND wt.type = 'webhook' AND wt.enabled = true
        AND wt.config->>'path' = $2
      LIMIT 1`,
    [tenantId, path],
  )
  return rows[0] ?? null
}

export async function findWorkflowsByEvent(
  tenantId: Id,
  eventName: string,
): Promise<{ workflowId: Id; workflowName: string; nodeId: string; config?: Record<string, unknown> }[]> {
  const { rows } = await pool.query<
    { workflowId: Id; workflowName: string; nodeId: string; config?: Record<string, unknown> }
  >(
    `SELECT wt.workflow_id AS "workflowId", w.name AS "workflowName",
            wt.node_id AS "nodeId", wt.config
       FROM workflow_triggers wt
       JOIN workflows w ON w.id = wt.workflow_id AND w.status = 'published'
      WHERE wt.tenant_id = $1 AND wt.type IN ('webhook', 'mes') AND wt.enabled = true
        AND wt.config->>'event' = $2 AND wt.config->>'mode' IN ('event', 'mes')`,
    [tenantId, eventName],
  )
  return rows
}

export async function countVectorizedChunks(tenantId: Id, kbaseId: Id): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM knowledge_chunks
      WHERE tenant_id = $1 AND kbase_id = $2 AND embedding_json IS NOT NULL`,
    [tenantId, kbaseId],
  )
  return rows[0]?.n ?? 0
}

export async function listChunksWithoutEmbedding(
  tenantId: Id,
  documentId: Id,
): Promise<{ id: Id; content: string }[]> {
  const { rows } = await pool.query<{ id: Id; content: string }>(
    `SELECT id, content FROM knowledge_chunks
      WHERE tenant_id = $1 AND document_id = $2 AND embedding_json IS NULL`,
    [tenantId, documentId],
  )
  return rows
}

/* ---------- workflow versions ---------- */

export type WorkflowVersion = {
  id: Id
  tenantId: Id
  workflowId: Id
  version: number
  definition: unknown
  note?: string | null
  isCurrent?: boolean
  createdBy?: Id | null
  createdAt: string
}

export async function getNextWorkflowVersion(tenantId: Id, workflowId: Id): Promise<number> {
  const { rows } = await pool.query<{ v: string }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v
       FROM workflow_versions WHERE tenant_id = $1 AND workflow_id = $2`,
    [tenantId, workflowId],
  )
  return Number(rows[0]?.v ?? 1)
}

export async function createWorkflowVersion(input: {
  tenantId: Id
  workflowId: Id
  version: number
  definition: unknown
  note?: string
  createdBy?: Id
}): Promise<WorkflowVersion> {
  const { rows } = await pool.query<WorkflowVersion>(
    `INSERT INTO workflow_versions (tenant_id, workflow_id, version, definition, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
               definition, note, created_by AS "createdBy", created_at AS "createdAt"`,
    [
      input.tenantId,
      input.workflowId,
      input.version,
      JSON.stringify(input.definition),
      input.note ?? null,
      input.createdBy ?? null,
    ],
  )
  return rows[0]
}

export async function listWorkflowVersions(
  tenantId: Id,
  workflowId: Id,
): Promise<WorkflowVersion[]> {
  // 对比当前生效 definition，标记 isCurrent
  const wf = await findWorkflowWithDefinition(tenantId, workflowId)
  const currentDef = JSON.stringify(wf?.definition ?? null)
  const { rows } = await pool.query<WorkflowVersion>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
            definition, note, created_by AS "createdBy", created_at AS "createdAt"
       FROM workflow_versions
      WHERE tenant_id = $1 AND workflow_id = $2
      ORDER BY version DESC`,
    [tenantId, workflowId],
  )
  return rows.map((v) => ({
    ...v,
    isCurrent: JSON.stringify(v.definition) === currentDef,
  }))
}

export async function findWorkflowVersion(
  tenantId: Id,
  versionId: Id,
): Promise<WorkflowVersion | null> {
  const { rows } = await pool.query<WorkflowVersion>(
    `SELECT id, tenant_id AS "tenantId", workflow_id AS "workflowId", version,
            definition, note, created_by AS "createdBy", created_at AS "createdAt"
       FROM workflow_versions
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, versionId],
  )
  return rows[0] ?? null
}

/* ---------- chat apps ---------- */

export type ChatApp = {
  id: Id
  tenantId: Id
  name: string
  description?: string | null
  workflowId: Id
  workflowName?: string
  apiKey: string
  status: 'draft' | 'published'
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function listChatApps(tenantId: Id): Promise<ChatApp[]> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT a.id, a.tenant_id AS "tenantId", a.name, a.description,
            a.workflow_id AS "workflowId", w.name AS "workflowName",
            a.api_key AS "apiKey", a.status, a.config,
            a.created_at AS "createdAt", a.updated_at AS "updatedAt"
       FROM chat_apps a
       JOIN workflows w ON w.id = a.workflow_id
      WHERE a.tenant_id = $1
      ORDER BY a.updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createChatApp(
  tenantId: Id,
  name: string,
  workflowId: Id,
  description?: string,
): Promise<ChatApp> {
  const apiKey = `app_${crypto.randomUUID().replace(/-/g, '')}`
  const { rows } = await pool.query<ChatApp>(
    `INSERT INTO chat_apps (tenant_id, name, description, workflow_id, api_key, config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id AS "tenantId", name, description,
               workflow_id AS "workflowId", api_key AS "apiKey", status, config,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, description ?? null, workflowId, apiKey, { welcome: '你好，有什么可以帮您？' }],
  )
  return rows[0]
}

export async function findChatApp(tenantId: Id, id: Id): Promise<ChatApp | null> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            workflow_id AS "workflowId", api_key AS "apiKey", status, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_apps WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function findChatAppByApiKey(apiKey: string): Promise<ChatApp | null> {
  const { rows } = await pool.query<ChatApp>(
    `SELECT id, tenant_id AS "tenantId", name, description,
            workflow_id AS "workflowId", api_key AS "apiKey", status, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_apps WHERE api_key = $1 AND status = 'published'`,
    [apiKey],
  )
  return rows[0] ?? null
}

export async function updateChatApp(
  tenantId: Id,
  id: Id,
  patch: {
    name?: string
    description?: string
    workflowId?: Id
    status?: ChatApp['status']
    config?: Record<string, unknown>
  },
): Promise<ChatApp | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name) }
  if (patch.description !== undefined) { sets.push(`description = $${i++}`); vals.push(patch.description) }
  if (patch.workflowId !== undefined) { sets.push(`workflow_id = $${i++}`); vals.push(patch.workflowId) }
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status) }
  if (patch.config !== undefined) { sets.push(`config = $${i++}`); vals.push(patch.config) }
  if (!sets.length) return findChatApp(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<ChatApp>(
    `UPDATE chat_apps SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING id, tenant_id AS "tenantId", name, description,
                workflow_id AS "workflowId", api_key AS "apiKey", status, config,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    vals,
  )
  return rows[0] ?? null
}

export async function deleteChatApp(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_apps WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- connectors ---------- */

export async function listConnectors(tenantId: Id): Promise<Connector[]> {
  const { rows } = await pool.query<Connector>(
    `SELECT id, tenant_id AS "tenantId", name, type, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM connectors WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function createConnector(
  tenantId: Id,
  name: string,
  type: Connector['type'],
  config: Record<string, unknown>,
): Promise<Connector> {
  const { rows } = await pool.query<Connector>(
    `INSERT INTO connectors (tenant_id, name, type, config)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tenant_id AS "tenantId", name, type, config,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, name, type, config],
  )
  return rows[0]
}

export async function updateConnector(
  tenantId: Id,
  id: Id,
  patch: { name?: string; config?: Record<string, unknown> },
): Promise<Connector | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`)
    vals.push(patch.name)
  }
  if (patch.config !== undefined) {
    sets.push(`config = $${i++}`)
    vals.push(patch.config)
  }
  if (!sets.length) return findConnector(tenantId, id)
  sets.push('updated_at = now()')
  vals.push(tenantId, id)
  const { rows } = await pool.query<Connector>(
    `UPDATE connectors SET ${sets.join(', ')}
      WHERE tenant_id = $${i++} AND id = $${i++}
      RETURNING id, tenant_id AS "tenantId", name, type, config,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    vals,
  )
  return rows[0] ?? null
}

export async function findConnector(tenantId: Id, id: Id): Promise<Connector | null> {
  const { rows } = await pool.query<Connector>(
    `SELECT id, tenant_id AS "tenantId", name, type, config,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM connectors WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function deleteConnector(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM connectors WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- audit & admin ---------- */

export async function insertAuditLog(input: {
  tenantId: Id
  userId?: Id | null
  action: string
  resourceType: string
  resourceId?: string
  detail?: unknown
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.tenantId,
      input.userId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.detail ?? null,
    ],
  )
}

export async function listAuditLogs(tenantId: Id, limit = 50): Promise<AuditLog[]> {
  const { rows } = await pool.query<AuditLog>(
    `SELECT a.id, a.tenant_id AS "tenantId", a.user_id AS "userId",
            u.email AS "userEmail", a.action, a.resource_type AS "resourceType",
            a.resource_id AS "resourceId", a.detail,
            a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [tenantId, Math.min(limit, 200)],
  )
  return rows
}

export async function listTenantMembers(tenantId: Id): Promise<TenantMember[]> {
  const { rows } = await pool.query<TenantMember>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.email,
            m.role, u.created_at AS "createdAt"
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      ORDER BY u.created_at ASC`,
    [tenantId],
  )
  return rows
}

export async function createTenantMember(
  tenantId: Id,
  email: string,
  password: string,
  role: Membership['role'],
): Promise<TenantMember> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const hashed = await hashPassword(password)
    let userId: string
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1)`,
      [email],
    )
    if (existing.rows[0]) {
      userId = existing.rows[0].id
      await client.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, userId])
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id`,
        [email, hashed],
      )
      userId = ins.rows[0].id
    }
    const dup = await client.query(
      `SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    )
    if (dup.rows[0]) {
      throw new Error('用户已是该租户成员')
    }
    const mem = await client.query<TenantMember>(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id AS "membershipId", user_id AS "userId",
                 $4::text AS email, role, now() AS "createdAt"`,
      [tenantId, userId, role, email],
    )
    await client.query('COMMIT')
    return mem.rows[0]
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function updateMemberRole(
  tenantId: Id,
  membershipId: Id,
  role: Membership['role'],
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE memberships SET role = $3 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, membershipId, role],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteTenantMember(tenantId: Id, membershipId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM memberships WHERE tenant_id = $1 AND id = $2`,
    [tenantId, membershipId],
  )
  return (rowCount ?? 0) > 0
}

export async function getMembershipRole(
  userId: Id,
  tenantId: Id,
): Promise<Membership['role'] | null> {
  const { rows } = await pool.query<{ role: Membership['role'] }>(
    `SELECT role FROM memberships WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  )
  return rows[0]?.role ?? null
}

/* ---------- team invites (团队邀请制) ---------- */

export type TeamInvite = {
  id: Id
  tenantId: Id
  tenantName?: string
  email: string | null
  role: Membership['role']
  token: string
  invitedBy?: Id | null
  invitedByEmail?: string | null
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

export async function createTeamInvite(
  tenantId: Id,
  input: { email?: string; role: Membership['role']; invitedBy: Id },
): Promise<TeamInvite> {
  const token = crypto.randomBytes(24).toString('hex')
  const email = String(input.email ?? '').trim().toLowerCase() || null
  const { rows } = await pool.query<TeamInvite>(
    `INSERT INTO team_invites (tenant_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
     RETURNING id, tenant_id AS "tenantId", email, role, token,
               invited_by AS "invitedBy", expires_at AS "expiresAt",
               used_at AS "usedAt", created_at AS "createdAt"`,
    [tenantId, email, input.role, token, input.invitedBy],
  )
  return rows[0]
}

export async function findTeamInviteByToken(token: string): Promise<TeamInvite | null> {
  const { rows } = await pool.query<TeamInvite>(
    `SELECT ti.id, ti.tenant_id AS "tenantId", t.name AS "tenantName",
            ti.email, ti.role, ti.token, ti.invited_by AS "invitedBy",
            ti.expires_at AS "expiresAt", ti.used_at AS "usedAt", ti.created_at AS "createdAt"
       FROM team_invites ti
       JOIN tenants t ON t.id = ti.tenant_id
      WHERE ti.token = $1`,
    [token],
  )
  return rows[0] ?? null
}

export async function listTeamInvites(tenantId: Id): Promise<TeamInvite[]> {
  const { rows } = await pool.query<TeamInvite>(
    `SELECT ti.id, ti.tenant_id AS "tenantId", t.name AS "tenantName",
            ti.email, ti.role, ti.token, ti.invited_by AS "invitedBy",
            u.email AS "invitedByEmail",
            ti.expires_at AS "expiresAt", ti.used_at AS "usedAt", ti.created_at AS "createdAt"
       FROM team_invites ti
       JOIN tenants t ON t.id = ti.tenant_id
       LEFT JOIN users u ON u.id = ti.invited_by
      WHERE ti.tenant_id = $1
      ORDER BY ti.created_at DESC`,
    [tenantId],
  )
  return rows
}

export async function revokeTeamInvite(tenantId: Id, inviteId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM team_invites WHERE tenant_id = $1 AND id = $2`,
    [tenantId, inviteId],
  )
  return (rowCount ?? 0) > 0
}

export async function acceptTeamInvite(
  token: string,
  userId: Id,
  userEmail: string,
): Promise<{ tenantId: Id; role: Membership['role']; tenantName: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inv = await client.query<TeamInvite>(
      `SELECT id, tenant_id AS "tenantId", email, role, token,
              expires_at AS "expiresAt", used_at AS "usedAt"
         FROM team_invites WHERE token = $1 FOR UPDATE`,
      [token],
    )
    const invite = inv.rows[0]
    if (!invite) throw new Error('邀请链接无效或已被撤销')
    if (invite.usedAt) throw new Error('该邀请已被使用')
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('邀请链接已过期')
    if (invite.email && invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error(`该邀请仅限 ${invite.email} 使用`)
    }
    const dup = await client.query(
      `SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
      [invite.tenantId, userId],
    )
    if (dup.rows[0]) throw new Error('你已经是该团队成员')
    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)`,
      [invite.tenantId, userId, invite.role],
    )
    await client.query(`UPDATE team_invites SET used_at = NOW() WHERE id = $1`, [invite.id])
    const t = await client.query<{ name: string }>(`SELECT name FROM tenants WHERE id = $1`, [invite.tenantId])
    await client.query('COMMIT')
    return { tenantId: invite.tenantId, role: invite.role, tenantName: t.rows[0]?.name ?? '' }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function listUserTenantsWithRole(
  userId: Id,
): Promise<{ id: Id; name: string; role: Membership['role'] }[]> {
  const { rows } = await pool.query<{ id: Id; name: string; role: Membership['role'] }>(
    `SELECT t.id, t.name, m.role
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
      ORDER BY t.created_at ASC`,
    [userId],
  )
  return rows
}

/* ---------- dashboard ---------- */

export async function getDashboardStats(tenantId: Id): Promise<DashboardStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [execRes, msgRes, aiRes, failRes] = await Promise.all([
    pool.query<{ total: string; success: string; failed: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'success')::text AS success,
              COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
         FROM executions
        WHERE tenant_id = $1 AND started_at >= $2`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages
        WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM execution_steps
        WHERE node_type IN ('ai.chat', 'ai.knowledge')
          AND started_at >= $2
          AND execution_id IN (SELECT id FROM executions WHERE tenant_id = $1)`,
      [tenantId, todayStart.toISOString()],
    ),
    pool.query<{ workflow_name: string; reason: string; count: string }>(
      `SELECT w.name AS workflow_name,
              COALESCE(e.error, '未知') AS reason,
              COUNT(*)::text AS count
         FROM executions e
         JOIN workflows w ON w.id = e.workflow_id
        WHERE e.tenant_id = $1 AND e.status = 'failed'
          AND e.started_at >= now() - interval '24 hours'
        GROUP BY w.name, e.error
        ORDER BY COUNT(*) DESC
        LIMIT 5`,
      [tenantId],
    ),
  ])

  const total = Number(execRes.rows[0]?.total ?? 0)
  const success = Number(execRes.rows[0]?.success ?? 0)
  const failed = Number(execRes.rows[0]?.failed ?? 0)

  return {
    executionsToday: total,
    successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 100,
    alertsToday: failed,
    messagesToday: Number(msgRes.rows[0]?.count ?? 0),
    aiCallsToday: Number(aiRes.rows[0]?.count ?? 0),
    failureTop: failRes.rows.map((r) => ({
      workflowName: r.workflow_name,
      reason: r.reason,
      count: Number(r.count),
    })),
  }
}

/* ---------- conversations ---------- */

export async function listConversations(tenantId: Id): Promise<Conversation[]> {
  const { rows } = await pool.query<Conversation>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            kind, title, updated_at AS "updatedAt"
       FROM conversations WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function upsertConversation(
  tenantId: Id,
  channel: 'wecom' | 'feishu' | 'dingtalk' | 'taobao',
  externalId: string,
  kind: 'group' | 'direct',
  title: string,
): Promise<Conversation> {
  const { rows } = await pool.query<Conversation>(
    `INSERT INTO conversations (tenant_id, channel, external_id, kind, title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, channel, external_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           title = EXCLUDED.title,
           updated_at = now()
     RETURNING id, tenant_id AS "tenantId", channel, external_id AS "externalId",
               kind, title, updated_at AS "updatedAt"`,
    [tenantId, channel, externalId, kind, title],
  )
  return rows[0]
}

export async function findConversationByExternalId(
  tenantId: Id,
  channel: 'wecom' | 'feishu' | 'dingtalk' | 'taobao',
  externalId: string,
): Promise<Conversation | null> {
  const { rows } = await pool.query<Conversation>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            kind, title, updated_at AS "updatedAt"
       FROM conversations
      WHERE tenant_id = $1 AND channel = $2 AND external_id = $3`,
    [tenantId, channel, externalId],
  )
  return rows[0] ?? null
}

/* ---------- messages ---------- */

export async function insertMessage(
  tenantId: Id,
  conversationId: Id,
  direction: 'in' | 'out',
  senderId: string,
  content: string,
  raw?: unknown,
  senderName?: string,
): Promise<Message> {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages
        (tenant_id, conversation_id, direction, sender_id, sender_name, content, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tenant_id AS "tenantId", conversation_id AS "conversationId",
               direction, sender_id AS "senderId", sender_name AS "senderName",
               content, created_at AS "createdAt", raw`,
    [tenantId, conversationId, direction, senderId, senderName ?? null, content, raw ?? null],
  )
  return rows[0]
}

export async function listMessages(
  tenantId: Id,
  conversationId: Id,
): Promise<Message[]> {
  const { rows } = await pool.query<Message>(
    `SELECT id, tenant_id AS "tenantId", conversation_id AS "conversationId",
            direction, sender_id AS "senderId", sender_name AS "senderName",
            content, created_at AS "createdAt", raw
       FROM messages
      WHERE tenant_id = $1 AND conversation_id = $2
      ORDER BY created_at ASC`,
    [tenantId, conversationId],
  )
  return rows
}

/* ---------- channel configs ---------- */

export async function getChannelConfig(
  tenantId: Id,
): Promise<ChannelConfig | null> {
  const { rows } = await pool.query<{
    tenantId: string
    wecom: WecomChannelConfig | null
    feishu: FeishuChannelConfig | null
    dingtalk: DingtalkChannelConfig | null
  }>(
    `SELECT tenant_id AS "tenantId", wecom, feishu, dingtalk
       FROM channel_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  const { encryptSecret, decryptSecret } = await import('./crypto.js')
  const result: ChannelConfig = { tenantId: rows[0].tenantId }
  if (rows[0].wecom) {
    const w = rows[0].wecom
    try { if (w.secret.startsWith('enc:')) w.secret = decryptSecret(decodeEnc(w.secret)) } catch {}
    try { if (w.encodingAESKey.startsWith('enc:')) w.encodingAESKey = decryptSecret(decodeEnc(w.encodingAESKey)) } catch {}
    result.wecom = w
  }
  if (rows[0].feishu) {
    const f = rows[0].feishu
    try { if (f.appSecret.startsWith('enc:')) f.appSecret = decryptSecret(decodeEnc(f.appSecret)) } catch {}
    try { if (f.encryptKey?.startsWith('enc:')) f.encryptKey = decryptSecret(decodeEnc(f.encryptKey)) } catch {}
    result.feishu = f
  }
  if (rows[0].dingtalk) {
    const d = rows[0].dingtalk
    try { if (d.appSecret.startsWith('enc:')) d.appSecret = decryptSecret(decodeEnc(d.appSecret)) } catch {}
    try { if (d.encodingAESKey?.startsWith('enc:')) d.encodingAESKey = decryptSecret(decodeEnc(d.encodingAESKey)) } catch {}
    result.dingtalk = d
  }
  return result
}

function encodeEnc(iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return 'enc:' + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

function decodeEnc(val: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const buf = Buffer.from(val.slice(4), 'base64')
  return { iv: buf.subarray(0, 12), tag: buf.subarray(12, 28), ciphertext: buf.subarray(28) }
}

export async function upsertWecomConfig(
  tenantId: Id,
  cfg: WecomChannelConfig,
): Promise<void> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = { ...cfg }
  if (enc.secret && !enc.secret.startsWith('enc:')) {
    const e = encryptSecret(enc.secret)
    enc.secret = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  if (enc.encodingAESKey && !enc.encodingAESKey.startsWith('enc:')) {
    const e = encryptSecret(enc.encodingAESKey)
    enc.encodingAESKey = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, wecom)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET wecom = EXCLUDED.wecom`,
    [tenantId, JSON.stringify(enc)],
  )
}

export async function upsertFeishuConfig(
  tenantId: Id,
  cfg: FeishuChannelConfig,
): Promise<void> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = { ...cfg }
  if (enc.appSecret && !enc.appSecret.startsWith('enc:')) {
    const e = encryptSecret(enc.appSecret)
    enc.appSecret = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  if (enc.encryptKey && !enc.encryptKey.startsWith('enc:')) {
    const e = encryptSecret(enc.encryptKey)
    enc.encryptKey = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, feishu)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET feishu = EXCLUDED.feishu`,
    [tenantId, JSON.stringify(enc)],
  )
}

export async function upsertDingtalkConfig(
  tenantId: Id,
  cfg: DingtalkChannelConfig,
): Promise<void> {
  const { encryptSecret } = await import('./crypto.js')
  const enc = { ...cfg }
  if (enc.appSecret && !enc.appSecret.startsWith('enc:')) {
    const e = encryptSecret(enc.appSecret)
    enc.appSecret = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  if (enc.encodingAESKey && !enc.encodingAESKey.startsWith('enc:')) {
    const e = encryptSecret(enc.encodingAESKey)
    enc.encodingAESKey = encodeEnc(e.iv, e.tag, e.ciphertext)
  }
  await pool.query(
    `INSERT INTO channel_configs (tenant_id, dingtalk)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET dingtalk = EXCLUDED.dingtalk`,
    [tenantId, JSON.stringify(enc)],
  )
}

/* ---------- chat sessions ---------- */

export async function getOrCreateChatSession(input: {
  tenantId: Id
  appId: Id
  externalUser?: string
}): Promise<{ id: Id }> {
  if (input.externalUser) {
    const { rows } = await pool.query<{ id: Id }>(
      `SELECT id FROM chat_sessions
        WHERE tenant_id = $1 AND app_id = $2 AND external_user = $3
        ORDER BY updated_at DESC LIMIT 1`,
      [input.tenantId, input.appId, input.externalUser],
    )
    if (rows[0]) return rows[0]
  }
  const { rows } = await pool.query<{ id: Id }>(
    `INSERT INTO chat_sessions (tenant_id, app_id, external_user)
     VALUES ($1, $2, $3) RETURNING id`,
    [input.tenantId, input.appId, input.externalUser ?? null],
  )
  return rows[0]
}

export async function insertChatMessage(input: {
  sessionId: Id
  role: 'user' | 'assistant' | 'system'
  content: string
  executionId?: Id
}): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, execution_id) VALUES ($1, $2, $3, $4)`,
    [input.sessionId, input.role, input.content, input.executionId ?? null],
  )
  await pool.query(`UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, [input.sessionId])
}

export async function listChatSessions(tenantId: Id, appId: Id) {
  const { rows } = await pool.query(
    `SELECT id, external_user AS "externalUser", title, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM chat_sessions WHERE tenant_id = $1 AND app_id = $2 ORDER BY updated_at DESC LIMIT 100`,
    [tenantId, appId],
  )
  return rows
}

export async function listChatMessages(tenantId: Id, sessionId: Id) {
  // F4: 关联 chat_sessions 按 tenant 过滤，避免跨租户 IDOR 读取他租户会话消息
  const { rows } = await pool.query(
    `SELECT m.id, m.role, m.content, m.execution_id AS "executionId", m.created_at AS "createdAt"
       FROM chat_messages m
       JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.session_id = $1 AND s.tenant_id = $2
      ORDER BY m.created_at ASC`,
    [sessionId, tenantId],
  )
  return rows
}

export async function updateConversationStatus(
  tenantId: Id,
  conversationId: Id,
  status: 'open' | 'pending' | 'resolved',
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE conversations SET status = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, conversationId, status],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteKnowledgeDocument(tenantId: Id, docId: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_documents WHERE tenant_id = $1 AND id = $2`,
    [tenantId, docId],
  )
  return (rowCount ?? 0) > 0
}

/* ---------- in-memory caches (token caches) ---------- */

const wecomAccessTokenCache = new Map<Id, CachedToken>()
const feishuTenantTokenCache = new Map<Id, CachedToken>()
const dingtalkAccessTokenCache = new Map<Id, CachedToken>()

/* ---------- exported db facade (kept for minimal route diff) ---------- */

export const db = {
  nowIso,
  id: newId,
  // session helpers
  createSession,
  getSession,
  deleteSession,
  deleteAllSessionsForUser,
  // platform helpers
  listMembershipsForUser,
  listTenantsWithWallet,
  getPlatformOverview,
  recordPlatformLoginAttempt,
  listAllRechargeOrders,
  listAllWalletTransactions,
  // user helpers
  findUserByEmailAndPassword,
  findUserById,
  findUserByEmail,
  createUser,
  // tenant helpers
  findTenantById,
  listTenantsForUser,
  createTenant,
  // membership helpers
  findFirstMembershipForUser,
  createMembership,
  // workflow helpers
  listWorkflows,
  findWorkflow,
  findWorkflowWithDefinition,
  createWorkflow,
  updateWorkflow,
  listPublishedWorkflows,
  // execution helpers
  createExecution,
  finishExecution,
  createExecutionStep,
  finishExecutionStep,
  listExecutions,
  findExecution,
  listExecutionSteps,
  listChildExecutions,
  // knowledge helpers
  listKnowledgeBases,
  createKnowledgeBase,
  findKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getKbChunkConfig,
  listKnowledgeDocuments,
  addKnowledgeDocument,
  searchKnowledgeChunks,
  // connector helpers
  listConnectors,
  createConnector,
  updateConnector,
  findConnector,
  deleteConnector,
  // audit & admin
  insertAuditLog,
  listAuditLogs,
  listTenantMembers,
  createTenantMember,
  updateMemberRole,
  deleteTenantMember,
  getMembershipRole,
  // team invites (团队邀请制)
  createTeamInvite,
  findTeamInviteByToken,
  listTeamInvites,
  revokeTeamInvite,
  acceptTeamInvite,
  listUserTenantsWithRole,
  getDashboardStats,
  setChunkEmbedding,
  searchKnowledgeChunksVector,
  searchKnowledgeChunksHybrid,
  countVectorizedChunks,
  listChunksWithoutEmbedding,
  enqueueExecutionJob,
  claimExecutionJob,
  claimExecutionJobById,
  findExecutionJob,
  cancelExecution,
  deleteWorkflow,
  hashPassword,
  verifyPassword,
  setUserPassword,
  getOrCreateChatSession,
  insertChatMessage,
  listChatSessions,
  listChatMessages,
  updateConversationStatus,
  deleteKnowledgeDocument,
  finishExecutionJob,
  clearWorkflowTriggers,
  upsertWorkflowTrigger,
  listAllCronTriggers,
  findWorkflowByWebhook,
  findWorkflowsByEvent,
  getNextWorkflowVersion,
  createWorkflowVersion,
  listWorkflowVersions,
  findWorkflowVersion,
  listChatApps,
  createChatApp,
  findChatApp,
  findChatAppByApiKey,
  updateChatApp,
  deleteChatApp,
  // conversation helpers
  listConversations,
  upsertConversation,
  findConversationByExternalId,
  // message helpers
  insertMessage,
  listMessages,
  // channel helpers
  getChannelConfig,
  upsertWecomConfig,
  upsertFeishuConfig,
  // llm provider helpers
  listProviders,
  findProvider,
  getProviderSecret,
  insertProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  setDefaultEmbeddingProvider,
  // credential helpers
  createCredential,
  updateCredential,
  listCredentials,
  findCredential,
  deleteCredential,
  getDecryptedCredential,
  createOAuthState,
  findOAuthStateByState,
  deleteOAuthState,
  // data source helpers (N9)
  listDataSources,
  findDataSource,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  setDataSourceStatus,
  insertDataAccessAudit,
  // agent helpers (N1-A)
  listAgents,
  findAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getOrCreateAgentSession,
  getAgentSession,
  updateAgentSessionHistory,
  // channel configs
  upsertDingtalkConfig,
  // caches
  wecomAccessTokenCache,
  feishuTenantTokenCache,
  dingtalkAccessTokenCache,
  // prompt templates
  listPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  createPromptTemplateVersion,
  listPromptTemplateVersions,
  getStoreProfile,
  getBotMessages,
  insertLlmUsage,
  listLlmUsage,
  aggregateLlmUsage,
  insertAgentCallTrace,
  listAgentCallTraces,
  platformMetricsOverview,
  platformTenantUsage,
  listTenantQuotas,
  upsertTenantQuota,
  quotaUsageForTenant,
  getTenantQuota,
  recordQuotaAlert,
  // wallet / payment
  getWalletBalance,
  ensureWallet,
  createRechargeOrder,
  getRechargeOrderByNo,
  listRechargeOrders,
  markOrderPaidAndCredit,
  chargeWalletForLlm,
  listWalletTransactions,
  getPaymentSetting,
  getAllPaymentSettings,
  setPaymentSetting,
  adjustWallet,
  // billing / plans / subscription
  getTenantBillingMode,
  setTenantBillingMode,
  listPlans,
  getPlan,
  getActiveSubscription,
  getSubscriptionUsage,
  createSubscription,
  cancelSubscription,
  consumeUsage,
}

/* ---------- credential helpers ---------- */

export async function createCredential(
  tenantId: Id,
  input: { name: string; type: Credential['type']; data: Record<string, unknown> },
): Promise<Credential> {
  const { encryptCredentialData, buildMaskedPreview } = await import('./credential.js')
  const encrypted = encryptCredentialData(input.type, input.data)
  const maskedPreview = buildMaskedPreview(input.type, input.data)
  const { rows } = await pool.query<Credential>(
    `INSERT INTO credentials (tenant_id, name, type, data, masked_preview)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, input.name, input.type, JSON.stringify(encrypted), maskedPreview],
  )
  return rows[0]
}

export async function updateCredential(
  tenantId: Id,
  id: Id,
  input: { name?: string; data?: Record<string, unknown> },
): Promise<Credential | null> {
  const existing = await findCredential(tenantId, id)
  if (!existing) return null

  const name = input.name ?? existing.name
  let data = existing.data

  if (input.data) {
    const { encryptCredentialData, buildMaskedPreview } = await import('./credential.js')
    const existingData = { ...existing.data, ...input.data }
    data = encryptCredentialData(existing.type, existingData)
    const { rows: updated } = await pool.query<Credential>(
      `UPDATE credentials SET name = $1, data = $2, masked_preview = $3, updated_at = now()
       WHERE id = $4 AND tenant_id = $5
       RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, JSON.stringify(data), buildMaskedPreview(existing.type, existingData), id, tenantId],
    )
    return updated[0] ?? null
  }

  const { rows } = await pool.query<Credential>(
    `UPDATE credentials SET name = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, id, tenantId],
  )
  return rows[0] ?? null
}

export async function listCredentials(tenantId: Id): Promise<Credential[]> {
  const { rows } = await pool.query<Credential>(
    `SELECT id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM credentials WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  )
  return rows
}

export async function findCredential(tenantId: Id, id: Id): Promise<Credential | null> {
  const { rows } = await pool.query<Credential>(
    `SELECT id, tenant_id AS "tenantId", name, type, data, masked_preview AS "maskedPreview",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM credentials WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  return rows[0] ?? null
}

export async function deleteCredential(tenantId: Id, id: Id): Promise<void> {
  await pool.query(`DELETE FROM credentials WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
}

export async function getDecryptedCredential(
  tenantId: Id,
  id: Id,
): Promise<Credential | null> {
  const cred = await findCredential(tenantId, id)
  if (!cred) return null
  const { decryptCredentialData } = await import('./credential.js')
  cred.data = decryptCredentialData(cred.type, cred.data)
  return cred
}

export async function createOAuthState(input: {
  credentialId: Id
  state: string
  redirectUri: string
  extra?: Record<string, unknown>
  ttlSeconds?: number
}): Promise<OAuthState> {
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 600) * 1000).toISOString()
  const { rows } = await pool.query<OAuthState>(
    `INSERT INTO credential_oauth_states (credential_id, state, redirect_uri, extra, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, credential_id AS "credentialId", state, redirect_uri AS "redirectUri",
               extra, expires_at AS "expiresAt", created_at AS "createdAt"`,
    [input.credentialId, input.state, input.redirectUri, JSON.stringify(input.extra ?? {}), expiresAt],
  )
  return rows[0]
}

export async function findOAuthStateByState(state: string): Promise<OAuthState | null> {
  const { rows } = await pool.query<OAuthState>(
    `SELECT id, credential_id AS "credentialId", state, redirect_uri AS "redirectUri",
            extra, expires_at AS "expiresAt", created_at AS "createdAt"
     FROM credential_oauth_states WHERE state = $1 AND expires_at > now()`,
    [state],
  )
  return rows[0] ?? null
}

export async function deleteOAuthState(state: string): Promise<void> {
  await pool.query(`DELETE FROM credential_oauth_states WHERE state = $1`, [state])
}

/* ---------- taobao helpers ---------- */

export async function getTaobaoConfig(
  tenantId: Id,
): Promise<TaobaoChannelConfig | null> {
  const { rows } = await pool.query<{
    tenantId: string
    appKey: string
    appSecret: string
    session: string
    sellerNick: string
    tmcGroup: string
  }>(
    `SELECT tenant_id AS "tenantId", app_key AS "appKey", app_secret AS "appSecret", session, seller_nick AS "sellerNick", tmc_group AS "tmcGroup"
       FROM taobao_channel_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return {
    appKey: rows[0].appKey,
    appSecret: rows[0].appSecret,
    session: rows[0].session,
    sellerNick: rows[0].sellerNick,
    tmcGroup: rows[0].tmcGroup,
  }
}

export async function upsertTaobaoConfig(
  tenantId: Id,
  cfg: TaobaoChannelConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO taobao_channel_configs (tenant_id, app_key, app_secret, session, seller_nick, tmc_group)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       app_key = EXCLUDED.app_key,
       app_secret = EXCLUDED.app_secret,
       session = EXCLUDED.session,
       seller_nick = EXCLUDED.seller_nick,
       tmc_group = EXCLUDED.tmc_group`,
    [tenantId, cfg.appKey, cfg.appSecret, cfg.session, cfg.sellerNick, cfg.tmcGroup],
  )
}


/* ---------- store profile helpers ---------- */

export interface StoreProfileRow {
  tenantId: string
  industry: string
  name: string
  slogan: string
  address: string
  landmark: string
  parking: string
  phone: string
  wechat: string
  hoursLunch: string
  hoursDinner: string
  hoursWeekend: string
  holidayNote: string
  avgPrice: string
  currentPromotions: Array<{ title: string; detail: string }>
  features: string[]
}

export async function getStoreProfile(tenantId: Id): Promise<StoreProfileRow | null> {
  const { rows } = await pool.query<StoreProfileRow>(
    `SELECT tenant_id AS "tenantId", industry, name, slogan, address, landmark, parking,
            phone, wechat, hours_lunch AS "hoursLunch", hours_dinner AS "hoursDinner",
            hours_weekend AS "hoursWeekend", holiday_note AS "holidayNote",
            avg_price AS "avgPrice", current_promotions AS "currentPromotions",
            features
     FROM store_profiles WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return rows[0]
}


/* ---------- bot assistant helpers ---------- */

export type BotScenarioRow = {
  id: string
  tenantId: string | null
  industry: string
  name: string
  description: string
  icon: string
  steps: unknown[]
  workflowId: string | null
  isBuiltin: boolean
  isActive: boolean
}

export type BotConfigRow = {
  id: string
  tenantId: string
  name: string
  greeting: string
  activeScenarios: string[]
  notifyAdmins: string[]
  autoReply: boolean
}

export type BotSessionRow = {
  id: string
  tenantId: string
  channel: string
  externalId: string
  step: number
  scenarioId: string | null
  params: Record<string, string>
  state: string
  createdAt: string
  updatedAt: string
}

export type BotMessageRow = {
  id: string
  tenantId: string
  sessionId: string
  direction: string
  senderId: string
  content: string
  createdAt: string
}

export async function getBotConfig(tenantId: Id): Promise<BotConfigRow | null> {
  const { rows } = await pool.query<BotConfigRow>(
    `SELECT id, tenant_id AS "tenantId", name, greeting,
            active_scenarios AS "activeScenarios",
            notify_admins AS "notifyAdmins",
            auto_reply AS "autoReply"
     FROM bot_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    activeScenarios: rows[0].activeScenarios ?? [],
    notifyAdmins: rows[0].notifyAdmins ?? [],
  }
}

export async function upsertBotConfig(tenantId: Id, cfg: {
  name: string
  greeting: string
  activeScenarios: string[]
  notifyAdmins: string[]
  autoReply: boolean
}): Promise<void> {
  await pool.query(
    `INSERT INTO bot_configs (tenant_id, name, greeting, active_scenarios, notify_admins, auto_reply)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       name = EXCLUDED.name,
       greeting = EXCLUDED.greeting,
       active_scenarios = EXCLUDED.active_scenarios,
       notify_admins = EXCLUDED.notify_admins,
       auto_reply = EXCLUDED.auto_reply,
       updated_at = now()`,
    [tenantId, cfg.name, cfg.greeting, cfg.activeScenarios, cfg.notifyAdmins, cfg.autoReply],
  )
}

export async function getBotSession(
  tenantId: Id,
  channel: string,
  externalId: string,
): Promise<BotSessionRow | null> {
  const { rows } = await pool.query<BotSessionRow>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            step, scenario_id AS "scenarioId", params, state,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions
     WHERE tenant_id = $1 AND channel = $2 AND external_id = $3`,
    [tenantId, channel, externalId],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    params: (rows[0].params as Record<string, string>) ?? {},
  }
}

/* ---------- data source helpers (N9) ---------- */

const DS_SELECT = `SELECT id, tenant_id AS "tenantId", name, kind, config,
       credential_id AS "credentialId", status, allow_query AS "allowQuery",
       field_allowlist AS "fieldAllowlist", last_ok_at AS "lastOkAt",
       last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"
FROM data_sources`

export async function listDataSources(tenantId: Id): Promise<DataSource[]> {
  const { rows } = await pool.query<DataSource>(
    `${DS_SELECT} WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  )
  return rows.map(r => ({
    ...r,
    config: (r.config as Record<string, unknown>) ?? {},
    fieldAllowlist: Array.isArray(r.fieldAllowlist) ? r.fieldAllowlist : [],
  }))
}

export async function findDataSource(tenantId: Id, id: Id): Promise<DataSource | null> {
  const { rows } = await pool.query<DataSource>(
    `${DS_SELECT} WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    config: (rows[0].config as Record<string, unknown>) ?? {},
    fieldAllowlist: Array.isArray(rows[0].fieldAllowlist) ? rows[0].fieldAllowlist : [],
  }
}

export async function createDataSource(
  tenantId: Id,
  input: {
    name: string
    kind: DataSource['kind']
    config: Record<string, unknown>
    credentialId?: Id | null
    fieldAllowlist?: string[]
    allowQuery?: boolean
  },
): Promise<DataSource> {
  const { rows } = await pool.query<DataSource>(
    `INSERT INTO data_sources (tenant_id, name, kind, config, credential_id, field_allowlist, allow_query)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tenant_id AS "tenantId", name, kind, config,
               credential_id AS "credentialId", status, allow_query AS "allowQuery",
               field_allowlist AS "fieldAllowlist", last_ok_at AS "lastOkAt",
               last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      tenantId,
      input.name,
      input.kind,
      JSON.stringify(input.config ?? {}),
      input.credentialId ?? null,
      JSON.stringify(input.fieldAllowlist ?? []),
      input.allowQuery !== false,
    ],
  )
  return {
    ...rows[0],
    config: (rows[0].config as Record<string, unknown>) ?? {},
    fieldAllowlist: Array.isArray(rows[0].fieldAllowlist) ? rows[0].fieldAllowlist : [],
  }
}

export async function updateDataSource(
  tenantId: Id,
  id: Id,
  patch: Partial<{
    name: string
    config: Record<string, unknown>
    credentialId: Id | null
    fieldAllowlist: string[]
    allowQuery: boolean
    status: DataSource['status']
  }>,
): Promise<DataSource | null> {
  const current = await findDataSource(tenantId, id)
  if (!current) return null
  const merged = {
    name: patch.name ?? current.name,
    config: patch.config ?? current.config,
    credentialId: patch.credentialId !== undefined ? patch.credentialId : current.credentialId,
    fieldAllowlist: patch.fieldAllowlist ?? current.fieldAllowlist,
    allowQuery: patch.allowQuery !== undefined ? patch.allowQuery : current.allowQuery,
    status: patch.status ?? current.status,
  }
  const { rows } = await pool.query<DataSource>(
    `UPDATE data_sources
     SET name = $1, config = $2, credential_id = $3, field_allowlist = $4,
         allow_query = $5, status = $6, updated_at = now()
     WHERE tenant_id = $7 AND id = $8
     RETURNING id, tenant_id AS "tenantId", name, kind, config,
               credential_id AS "credentialId", status, allow_query AS "allowQuery",
               field_allowlist AS "fieldAllowlist", last_ok_at AS "lastOkAt",
               last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      merged.name,
      JSON.stringify(merged.config),
      merged.credentialId,
      JSON.stringify(merged.fieldAllowlist),
      merged.allowQuery,
      merged.status,
      tenantId,
      id,
    ],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    config: (rows[0].config as Record<string, unknown>) ?? {},
    fieldAllowlist: Array.isArray(rows[0].fieldAllowlist) ? rows[0].fieldAllowlist : [],
  }
}

export async function deleteDataSource(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM data_sources WHERE tenant_id = $1 AND id = $2',
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function setDataSourceStatus(
  tenantId: Id,
  id: Id,
  status: DataSource['status'],
  error?: string | null,
): Promise<DataSource | null> {
  const setOk = status === 'active'
  const { rows } = await pool.query<DataSource>(
    `UPDATE data_sources
     SET status = $1,
         last_error = $2,
         last_ok_at = CASE WHEN $3 THEN now() ELSE last_ok_at END,
         updated_at = now()
     WHERE tenant_id = $4 AND id = $5
     RETURNING id, tenant_id AS "tenantId", name, kind, config,
               credential_id AS "credentialId", status, allow_query AS "allowQuery",
               field_allowlist AS "fieldAllowlist", last_ok_at AS "lastOkAt",
               last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [status, error ?? null, setOk, tenantId, id],
  )
  if (!rows[0]) return null
  return {
    ...rows[0],
    config: (rows[0].config as Record<string, unknown>) ?? {},
    fieldAllowlist: Array.isArray(rows[0].fieldAllowlist) ? rows[0].fieldAllowlist : [],
  }
}

export async function insertDataAccessAudit(input: {
  tenantId: Id
  sourceId?: Id | null
  userId?: Id | null
  operation: string
  queryText?: string | null
  rowCount?: number | null
  durationMs?: number | null
  error?: string | null
}): Promise<DataAccessAudit> {
  const { rows } = await pool.query<DataAccessAudit>(
    `INSERT INTO data_access_audit (tenant_id, source_id, user_id, operation, query_text, row_count, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, tenant_id AS "tenantId", source_id AS "sourceId", user_id AS "userId",
               operation, query_text AS "queryText", row_count AS "rowCount",
               duration_ms AS "durationMs", error, created_at AS "createdAt"`,
    [
      input.tenantId,
      input.sourceId ?? null,
      input.userId ?? null,
      input.operation,
      input.queryText ?? null,
      input.rowCount ?? null,
      input.durationMs ?? null,
      input.error ?? null,
    ],
  )
  return rows[0]
}

/* ---------- agent helpers (N1-A) ---------- */

const AGENT_SELECT = `SELECT id, tenant_id AS "tenantId", name, description,
       system_prompt AS "systemPrompt", model_provider_id AS "modelProviderId",
       tools, allowed_sources AS "allowedSources", max_turns AS "maxTurns",
       timeout_ms AS "timeoutMs", status,
       created_at AS "createdAt", updated_at AS "updatedAt"
FROM agents`

function parseAgent(row: Agent): Agent {
  return {
    ...row,
    tools: Array.isArray(row.tools) ? row.tools : [],
    allowedSources: Array.isArray(row.allowedSources) ? row.allowedSources : [],
  }
}

export async function listAgents(tenantId: Id): Promise<Agent[]> {
  const { rows } = await pool.query<Agent>(
    `${AGENT_SELECT} WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  )
  return rows.map(parseAgent)
}

export async function findAgent(tenantId: Id, id: Id): Promise<Agent | null> {
  const { rows } = await pool.query<Agent>(
    `${AGENT_SELECT} WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  if (!rows[0]) return null
  return parseAgent(rows[0])
}

export async function createAgent(
  tenantId: Id,
  input: {
    name: string
    description?: string
    systemPrompt?: string
    modelProviderId?: Id | null
    tools?: string[]
    allowedSources?: string[]
    maxTurns?: number
    timeoutMs?: number
    status?: Agent['status']
  },
): Promise<Agent> {
  const { rows } = await pool.query<Agent>(
    `INSERT INTO agents (tenant_id, name, description, system_prompt, model_provider_id,
                         tools, allowed_sources, max_turns, timeout_ms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, tenant_id AS "tenantId", name, description,
               system_prompt AS "systemPrompt", model_provider_id AS "modelProviderId",
               tools, allowed_sources AS "allowedSources", max_turns AS "maxTurns",
               timeout_ms AS "timeoutMs", status,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      tenantId,
      input.name,
      input.description ?? '',
      input.systemPrompt ?? '',
      input.modelProviderId ?? null,
      JSON.stringify(input.tools ?? []),
      JSON.stringify(input.allowedSources ?? []),
      input.maxTurns ?? 10,
      input.timeoutMs ?? 60000,
      input.status ?? 'draft',
    ],
  )
  return parseAgent(rows[0])
}

export async function updateAgent(
  tenantId: Id,
  id: Id,
  patch: Partial<{
    name: string
    description: string
    systemPrompt: string
    modelProviderId: Id | null
    tools: string[]
    allowedSources: string[]
    maxTurns: number
    timeoutMs: number
    status: Agent['status']
  }>,
): Promise<Agent | null> {
  const current = await findAgent(tenantId, id)
  if (!current) return null
  const merged = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    systemPrompt: patch.systemPrompt ?? current.systemPrompt,
    modelProviderId: patch.modelProviderId !== undefined ? patch.modelProviderId : current.modelProviderId,
    tools: patch.tools ?? current.tools,
    allowedSources: patch.allowedSources ?? current.allowedSources,
    maxTurns: patch.maxTurns ?? current.maxTurns,
    timeoutMs: patch.timeoutMs ?? current.timeoutMs,
    status: patch.status ?? current.status,
  }
  const { rows } = await pool.query<Agent>(
    `UPDATE agents SET name = $1, description = $2, system_prompt = $3, model_provider_id = $4,
                       tools = $5, allowed_sources = $6, max_turns = $7, timeout_ms = $8, status = $9,
                       updated_at = now()
     WHERE tenant_id = $10 AND id = $11
     RETURNING id, tenant_id AS "tenantId", name, description,
               system_prompt AS "systemPrompt", model_provider_id AS "modelProviderId",
               tools, allowed_sources AS "allowedSources", max_turns AS "maxTurns",
               timeout_ms AS "timeoutMs", status,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      merged.name, merged.description, merged.systemPrompt, merged.modelProviderId,
      JSON.stringify(merged.tools), JSON.stringify(merged.allowedSources),
      merged.maxTurns, merged.timeoutMs, merged.status,
      tenantId, id,
    ],
  )
  if (!rows[0]) return null
  return parseAgent(rows[0])
}

export async function deleteAgent(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents WHERE tenant_id = $1 AND id = $2',
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

const SESSION_SELECT = `SELECT id, tenant_id AS "tenantId", agent_id AS "agentId",
       channel, external_id AS "externalId", summary, history,
       created_at AS "createdAt", updated_at AS "updatedAt"
FROM agent_sessions`

function parseSession(row: AgentSession): AgentSession {
  return {
    ...row,
    history: Array.isArray(row.history) ? row.history : [],
  }
}

export async function getAgentSession(tenantId: Id, id: Id): Promise<AgentSession | null> {
  const { rows } = await pool.query<AgentSession>(
    `${SESSION_SELECT} WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  if (!rows[0]) return null
  return parseSession(rows[0])
}

export async function getOrCreateAgentSession(input: {
  tenantId: Id
  agentId?: Id
  channel?: string
  externalId?: string
}): Promise<AgentSession> {
  if (input.channel && input.externalId && input.agentId) {
    // 有 channel+external+agent → upsert
    const { rows } = await pool.query<AgentSession>(
      `INSERT INTO agent_sessions (tenant_id, agent_id, channel, external_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, agent_id, channel, external_id)
       WHERE channel IS NOT NULL AND external_id IS NOT NULL
       DO UPDATE SET updated_at = now()
       RETURNING id, tenant_id AS "tenantId", agent_id AS "agentId",
                 channel, external_id AS "externalId", summary, history,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [input.tenantId, input.agentId, input.channel, input.externalId],
    )
    return parseSession(rows[0])
  }
  // 否则直接创建新会话
  const { rows } = await pool.query<AgentSession>(
    `INSERT INTO agent_sessions (tenant_id, agent_id, channel, external_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tenant_id AS "tenantId", agent_id AS "agentId",
               channel, external_id AS "externalId", summary, history,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [input.tenantId, input.agentId ?? null, input.channel ?? null, input.externalId ?? null],
  )
  return parseSession(rows[0])
}

export async function updateAgentSessionHistory(
  tenantId: Id,
  sessionId: Id,
  history: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
  summary?: string,
): Promise<AgentSession | null> {
  const { rows } = await pool.query<AgentSession>(
    `UPDATE agent_sessions
     SET history = $1, summary = COALESCE($2, summary), updated_at = now()
     WHERE tenant_id = $3 AND id = $4
     RETURNING id, tenant_id AS "tenantId", agent_id AS "agentId",
               channel, external_id AS "externalId", summary, history,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [JSON.stringify(history), summary ?? null, tenantId, sessionId],
  )
  if (!rows[0]) return null
  return parseSession(rows[0])
}

export async function createBotSession(
  tenantId: Id,
  channel: string,
  externalId: string,
): Promise<BotSessionRow> {
  const { rows } = await pool.query<BotSessionRow>(
    `INSERT INTO bot_sessions (tenant_id, channel, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, channel, external_id) DO UPDATE SET updated_at = now()
     RETURNING id, tenant_id AS "tenantId", channel, external_id AS "externalId",
               step, scenario_id AS "scenarioId", params, state,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, channel, externalId],
  )
  return {
    ...rows[0],
    params: (rows[0].params as Record<string, string>) ?? {},
  }
}

export async function updateBotSession(
  sessionId: string,
  patch: { state?: string; step?: number; scenarioId?: string; params?: Record<string, string> },
): Promise<void> {
  const sets: string[] = ['updated_at = now()']
  const vals: unknown[] = [sessionId]
  let idx = 2
  if (patch.state !== undefined) { sets.push(`state = $${idx++}`); vals.push(patch.state) }
  if (patch.step !== undefined) { sets.push(`step = $${idx++}`); vals.push(patch.step) }
  if (patch.scenarioId !== undefined) { sets.push(`scenario_id = $${idx++}`); vals.push(patch.scenarioId) }
  if (patch.params !== undefined) { sets.push(`params = $${idx++}`); vals.push(JSON.stringify(patch.params)) }
  await pool.query(
    `UPDATE bot_sessions SET ${sets.join(', ')} WHERE id = $1`,
    vals,
  )
}

export async function getTenantBotScenarios(tenantId: Id): Promise<BotScenarioRow[]> {
  const { rows } = await pool.query<BotScenarioRow>(
    `SELECT id, tenant_id AS "tenantId", industry, name, description, icon,
            steps, workflow_id AS "workflowId",
            is_builtin AS "isBuiltin", is_active AS "isActive"
     FROM bot_scenarios
     WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  )
  return rows
}

export async function listBotSessions(tenantId: Id): Promise<BotSessionRow[]> {
  const { rows } = await pool.query<BotSessionRow>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId",
            step, scenario_id AS "scenarioId", params, state,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions WHERE tenant_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [tenantId],
  )
  return rows.map(r => ({ ...r, params: (r.params as Record<string, string>) ?? {} }))
}

export async function getBotMessages(tenantId: Id, sessionId: string): Promise<BotMessageRow[]> {
  const { rows } = await pool.query<BotMessageRow>(
    `SELECT id, tenant_id AS "tenantId", session_id AS "sessionId",
            direction, sender_id AS "senderId", content,
            created_at AS "createdAt"
     FROM bot_messages WHERE tenant_id = $1 AND session_id = $2
     ORDER BY created_at ASC`,
    [tenantId, sessionId],
  )
  return rows
}

export async function insertBotMessage(
  tenantId: Id,
  sessionId: string,
  direction: string,
  senderId: string,
  content: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO bot_messages (tenant_id, session_id, direction, sender_id, content)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, sessionId, direction, senderId, content],
  )
}

// ---------- prompt templates ----------

export type PromptTemplate = {
  id: Id
  tenantId: Id
  name: string
  description: string
  systemPrompt: string
  userPrompt: string
  variables: { key: string; label: string; type: 'text' | 'select'; options?: string[]; default?: string }[]
  tags: string[]
  version: number
  isLatest: boolean
  sourceId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

const PROMPT_COLS = `
  id, tenant_id AS "tenantId", name, description,
  system_prompt AS "systemPrompt", user_prompt AS "userPrompt",
  variables, tags, version, is_latest AS "isLatest",
  source_id AS "sourceId", created_by AS "createdBy",
  created_at AS "createdAt", updated_at AS "updatedAt"
`

export async function listPromptTemplates(tenantId: Id): Promise<PromptTemplate[]> {
  const { rows } = await pool.query<PromptTemplate>(
    `SELECT ${PROMPT_COLS} FROM prompt_templates
     WHERE tenant_id = $1 AND is_latest = true
     ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows
}

export async function getPromptTemplate(tenantId: Id, id: Id): Promise<PromptTemplate | null> {
  const { rows } = await pool.query<PromptTemplate>(
    `SELECT ${PROMPT_COLS} FROM prompt_templates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return rows[0] ?? null
}

export async function createPromptTemplate(input: {
  tenantId: Id
  name: string
  description?: string
  systemPrompt?: string
  userPrompt?: string
  variables?: unknown[]
  tags?: string[]
  createdBy?: Id | null
}): Promise<PromptTemplate> {
  const { rows } = await pool.query<PromptTemplate>(
    `INSERT INTO prompt_templates
       (tenant_id, name, description, system_prompt, user_prompt, variables, tags, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${PROMPT_COLS}`,
    [
      input.tenantId,
      input.name,
      input.description ?? '',
      input.systemPrompt ?? '',
      input.userPrompt ?? '',
      JSON.stringify(input.variables ?? []),
      input.tags ?? [],
      input.createdBy ?? null,
    ],
  )
  return rows[0]
}

export async function updatePromptTemplate(
  tenantId: Id,
  id: Id,
  input: {
    name?: string
    description?: string
    systemPrompt?: string
    userPrompt?: string
    variables?: unknown[]
    tags?: string[]
  },
): Promise<PromptTemplate | null> {
  const sets: string[] = ['updated_at = now()']
  const vals: unknown[] = [tenantId, id]
  let i = 3
  if (input.name !== undefined) { sets.push(`name = $${i++}`); vals.push(input.name) }
  if (input.description !== undefined) { sets.push(`description = $${i++}`); vals.push(input.description) }
  if (input.systemPrompt !== undefined) { sets.push(`system_prompt = $${i++}`); vals.push(input.systemPrompt) }
  if (input.userPrompt !== undefined) { sets.push(`user_prompt = $${i++}`); vals.push(input.userPrompt) }
  if (input.variables !== undefined) { sets.push(`variables = $${i++}`); vals.push(JSON.stringify(input.variables)) }
  if (input.tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(input.tags) }
  if (sets.length === 1) return getPromptTemplate(tenantId, id)
  const { rows } = await pool.query<PromptTemplate>(
    `UPDATE prompt_templates SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING ${PROMPT_COLS}`,
    vals,
  )
  return rows[0] ?? null
}

export async function deletePromptTemplate(tenantId: Id, id: Id): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM prompt_templates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  )
  return (rowCount ?? 0) > 0
}

export async function createPromptTemplateVersion(
  tenantId: Id,
  id: Id,
): Promise<PromptTemplate | null> {
  const original = await getPromptTemplate(tenantId, id)
  if (!original) return null
  const { rows } = await pool.query<PromptTemplate>(
    `INSERT INTO prompt_templates
       (tenant_id, name, description, system_prompt, user_prompt, variables, tags, version, source_id, created_by)
     SELECT tenant_id, name, description, system_prompt, user_prompt, variables, tags, version + 1, $2, created_by
       FROM prompt_templates WHERE id = $1
     RETURNING ${PROMPT_COLS}`,
    [id, original.sourceId ?? id],
  )
  await pool.query(`UPDATE prompt_templates SET is_latest = false WHERE id = $1`, [id])
  return rows[0]
}

export async function listPromptTemplateVersions(tenantId: Id, sourceId: Id): Promise<PromptTemplate[]> {
  const { rows } = await pool.query<PromptTemplate>(
    `SELECT ${PROMPT_COLS} FROM prompt_templates
     WHERE tenant_id = $1 AND (id = $2 OR source_id = $2)
     ORDER BY version DESC`,
    [tenantId, sourceId],
  )
  return rows
}
/* ============================ F6 可观测性 ============================ */

export type LlmUsageRow = {
  id: string
  tenantId: string
  executionId?: string | null
  nodeId?: string | null
  agentId?: string | null
  sessionId?: string | null
  kind: string
  providerName?: string | null
  model?: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  createdAt: string
}

export async function insertLlmUsage(input: {
  tenantId: Id
  executionId?: Id | null
  nodeId?: string | null
  agentId?: Id | null
  sessionId?: Id | null
  kind: string
  providerId?: Id | null
  providerName?: string | null
  model?: string | null
  promptTokens?: number
  completionTokens?: number
  estimatedCost?: number
}): Promise<void> {
  const promptTokens = Math.max(0, Math.round(Number(input.promptTokens ?? 0)))
  const completionTokens = Math.max(0, Math.round(Number(input.completionTokens ?? 0)))
  try {
    await pool.query(
      `INSERT INTO llm_usage
         (tenant_id, execution_id, node_id, agent_id, session_id, kind,
          provider_id, provider_name, model, prompt_tokens, completion_tokens,
          total_tokens, estimated_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.tenantId,
        input.executionId ?? null,
        input.nodeId ?? null,
        input.agentId ?? null,
        input.sessionId ?? null,
        input.kind,
        input.providerId ?? null,
        input.providerName ?? null,
        input.model ?? null,
        promptTokens,
        completionTokens,
        promptTokens + completionTokens,
        parseFloat(String(input.estimatedCost ?? 0)),
      ],
    )
  } catch (e) {
    console.error('[llm_usage] insert failed:', e)
  }
}

export async function listLlmUsage(
  tenantId: Id,
  opts: { limit?: number; kind?: string; executionId?: Id; agentId?: Id } = {},
): Promise<LlmUsageRow[]> {
  const conds: string[] = ['tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts.kind) { conds.push(`kind = $${i++}`); vals.push(opts.kind) }
  if (opts.executionId) { conds.push(`execution_id = $${i++}`); vals.push(opts.executionId) }
  if (opts.agentId) { conds.push(`agent_id = $${i++}`); vals.push(opts.agentId) }
  const limit = Math.min(Math.max(Number(opts.limit ?? 100), 1), 500)
  const { rows } = await pool.query<{
    id: string; tenant_id: string; execution_id?: string | null; node_id?: string | null;
    agent_id?: string | null; session_id?: string | null; kind: string;
    provider_name?: string | null; model?: string | null;
    prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost: number;
    created_at: string
  }>(
    `SELECT id, tenant_id, execution_id, node_id, agent_id, session_id, kind,
            provider_name, model, prompt_tokens, completion_tokens, total_tokens,
            estimated_cost, created_at
       FROM llm_usage
      WHERE ${conds.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${i}`,
    [...vals, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    executionId: r.execution_id,
    nodeId: r.node_id,
    agentId: r.agent_id,
    sessionId: r.session_id,
    kind: r.kind,
    providerName: r.provider_name,
    model: r.model,
    promptTokens: Number(r.prompt_tokens ?? 0),
    completionTokens: Number(r.completion_tokens ?? 0),
    totalTokens: Number(r.total_tokens ?? 0),
    estimatedCost: Number(r.estimated_cost ?? 0),
    createdAt: r.created_at,
  }))
}

export async function aggregateLlmUsage(
  tenantId: Id,
  opts: { from?: string; to?: string; kind?: string } = {},
): Promise<{
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCost: number
  calls: number
  byModel: { model: string; calls: string; totalTokens: string; estimatedCost: string }[]
  byDay: { day: string; calls: string; totalTokens: string; estimatedCost: string }[]
}> {
  const conds: string[] = ['tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts.kind) { conds.push(`kind = $${i++}`); vals.push(opts.kind) }
  if (opts.from) { conds.push(`created_at >= $${i++}`); vals.push(opts.from) }
  if (opts.to) { conds.push(`created_at < $${i++}`); vals.push(opts.to) }
  const where = conds.join(' AND ')

  const { rows: sums } = await pool.query<{
    total_tokens: string; prompt_tokens: string; completion_tokens: string;
    estimated_cost: string; calls: string
  }>(
    `SELECT COALESCE(SUM(total_tokens),0)::text AS total_tokens,
            COALESCE(SUM(prompt_tokens),0)::text AS prompt_tokens,
            COALESCE(SUM(completion_tokens),0)::text AS completion_tokens,
            COALESCE(SUM(estimated_cost),0)::text AS estimated_cost,
            COUNT(*)::text AS calls
       FROM llm_usage WHERE ${where}`,
    vals,
  )

  const { rows: byModel } = await pool.query<{ model: string; calls: string; total_tokens: string; estimated_cost: string }>(
    `SELECT COALESCE(model,'(默认)') AS model, COUNT(*)::text AS calls,
            COALESCE(SUM(total_tokens),0)::text AS total_tokens,
            COALESCE(SUM(estimated_cost),0)::text AS estimated_cost
       FROM llm_usage WHERE ${where}
      GROUP BY model ORDER BY COUNT(*) DESC LIMIT 20`,
    vals,
  )

  const { rows: byDay } = await pool.query<{ day: string; calls: string; total_tokens: string; estimated_cost: string }>(
    `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            COUNT(*)::text AS calls,
            COALESCE(SUM(total_tokens),0)::text AS total_tokens,
            COALESCE(SUM(estimated_cost),0)::text AS estimated_cost
       FROM llm_usage WHERE ${where}
      GROUP BY day ORDER BY day DESC LIMIT 60`,
    vals,
  )

  return {
    totalTokens: Number(sums[0]?.total_tokens ?? 0),
    promptTokens: Number(sums[0]?.prompt_tokens ?? 0),
    completionTokens: Number(sums[0]?.completion_tokens ?? 0),
    estimatedCost: Number(sums[0]?.estimated_cost ?? 0),
    calls: Number(sums[0]?.calls ?? 0),
    byModel: byModel.map((r) => ({ model: r.model, calls: r.calls, totalTokens: r.total_tokens, estimatedCost: r.estimated_cost })),
    byDay: byDay.map((r) => ({ day: r.day, calls: r.calls, totalTokens: r.total_tokens, estimatedCost: r.estimated_cost })),
  }
}

/* ---------- Agent 调用链 ---------- */

export type AgentCallTrace = {
  id: string
  tenantId: string
  agentId?: string | null
  sessionId?: string | null
  executionId?: string | null
  step: string
  toolName?: string | null
  args?: unknown
  result?: unknown
  llmModel?: string | null
  llmPromptTokens?: number | null
  llmCompletionTokens?: number | null
  durationMs?: number | null
  error?: string | null
  createdAt: string
}

export async function insertAgentCallTrace(input: {
  tenantId: Id
  agentId?: Id | null
  sessionId?: Id | null
  executionId?: Id | null
  step: string
  toolName?: string | null
  args?: unknown
  result?: unknown
  llmModel?: string | null
  llmPromptTokens?: number | null
  llmCompletionTokens?: number | null
  durationMs?: number | null
  error?: string | null
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO agent_call_traces
         (tenant_id, agent_id, session_id, execution_id, step, tool_name, args, result,
          llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.tenantId,
        input.agentId ?? null,
        input.sessionId ?? null,
        input.executionId ?? null,
        input.step,
        input.toolName ?? null,
        input.args ?? null,
        input.result ?? null,
        input.llmModel ?? null,
        input.llmPromptTokens ?? null,
        input.llmCompletionTokens ?? null,
        input.durationMs ?? null,
        input.error ?? null,
      ],
    )
  } catch (e) {
    console.error('[agent_call_traces] insert failed:', e)
  }
}

export async function listAgentCallTraces(
  tenantId: Id,
  opts: { limit?: number; sessionId?: Id; agentId?: Id; executionId?: Id } = {},
): Promise<AgentCallTrace[]> {
  const conds: string[] = ['tenant_id = $1']
  const vals: unknown[] = [tenantId]
  let i = 2
  if (opts.sessionId) { conds.push(`session_id = $${i++}`); vals.push(opts.sessionId) }
  if (opts.agentId) { conds.push(`agent_id = $${i++}`); vals.push(opts.agentId) }
  if (opts.executionId) { conds.push(`execution_id = $${i++}`); vals.push(opts.executionId) }
  const limit = Math.min(Math.max(Number(opts.limit ?? 100), 1), 500)
  const { rows } = await pool.query<{
    id: string; tenant_id: string; agent_id?: string | null; session_id?: string | null;
    execution_id?: string | null; step: string; tool_name?: string | null;
    args?: unknown; result?: unknown; llm_model?: string | null;
    llm_prompt_tokens?: number | null; llm_completion_tokens?: number | null;
    duration_ms?: number | null; error?: string | null; created_at: string
  }>(
    `SELECT id, tenant_id, agent_id, session_id, execution_id, step, tool_name, args, result,
            llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, error, created_at
       FROM agent_call_traces
      WHERE ${conds.join(' AND ')}
      ORDER BY created_at ASC
      LIMIT $${i}`,
    [...vals, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    sessionId: r.session_id,
    executionId: r.execution_id,
    step: r.step,
    toolName: r.tool_name,
    args: r.args,
    result: r.result,
    llmModel: r.llm_model,
    llmPromptTokens: r.llm_prompt_tokens ? Number(r.llm_prompt_tokens) : null,
    llmCompletionTokens: r.llm_completion_tokens ? Number(r.llm_completion_tokens) : null,
    durationMs: r.duration_ms ? Number(r.duration_ms) : null,
    error: r.error,
    createdAt: r.created_at,
  }))
}

/* ---------- platform metrics (N7) ---------- */

export async function platformMetricsOverview(opts: { from?: string; to?: string } = {}): Promise<{
  tenants: number
  llmCalls: number
  agentCalls: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCost: number
  byDay: { day: string; calls: string; totalTokens: string; estimatedCost: string }[]
}> {
  const conds: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (opts.from) { conds.push(`created_at >= $${i++}`); vals.push(opts.from) }
  if (opts.to) { conds.push(`created_at < $${i++}`); vals.push(opts.to) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

  const [t, u, tc, days] = await Promise.all([
    pool.query<{ c: string }>('SELECT count(*)::text AS c FROM tenants'),
    pool.query<{ a: string; b: string; c: string; d: string; e: string }>(
      `SELECT COALESCE(SUM(prompt_tokens),0)::text AS a,
              COALESCE(SUM(completion_tokens),0)::text AS b,
              COALESCE(SUM(total_tokens),0)::text AS c,
              COALESCE(SUM(estimated_cost),0)::text AS d,
              COUNT(*)::text AS e
         FROM llm_usage ${where}`,
      vals,
    ),
    pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM agent_call_traces ${where}`, vals),
    pool.query<{ day: string; calls: string; total_tokens: string; estimated_cost: string }>(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
              COUNT(*)::text AS calls,
              COALESCE(SUM(total_tokens),0)::text AS total_tokens,
              COALESCE(SUM(estimated_cost),0)::text AS estimated_cost
         FROM llm_usage ${where}
        GROUP BY to_char(created_at, 'YYYY-MM-DD')
        ORDER BY day`,
      vals,
    ),
  ])
  return {
    tenants: Number(t.rows[0]?.c ?? 0),
    llmCalls: Number(u.rows[0]?.e ?? 0),
    agentCalls: Number(tc.rows[0]?.c ?? 0),
    totalTokens: Number(u.rows[0]?.c ?? 0),
    promptTokens: Number(u.rows[0]?.a ?? 0),
    completionTokens: Number(u.rows[0]?.b ?? 0),
    estimatedCost: Number(u.rows[0]?.d ?? 0),
    byDay: days.rows.map((r) => ({ day: r.day, calls: r.calls, totalTokens: r.total_tokens, estimatedCost: r.estimated_cost })),
  }
}

export async function platformTenantUsage(opts: { from?: string; to?: string } = {}): Promise<
  { tenantId: string; name: string; llmCalls: string; agentCalls: string; totalTokens: string; estimatedCost: string; lastUsedAt: string | null }[]
> {
  const conds: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (opts.from) { conds.push(`created_at >= $${i++}`); vals.push(opts.from) }
  if (opts.to) { conds.push(`created_at < $${i++}`); vals.push(opts.to) }
  const where = conds.length ? conds.join(' AND ') : '1=1'

  const { rows } = await pool.query<{
    tenant_id: string; name: string; llm: string; cost: string; tokens: string; last: string | null; agt: string
  }>(
    `SELECT t.id AS tenant_id, t.name,
            COALESCE(u.llm, 0)::text AS llm,
            COALESCE(u.cost, 0)::text AS cost,
            COALESCE(u.tokens, 0)::text AS tokens,
            u.last AS last,
            COALESCE(a.agt, 0)::text AS agt
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS llm, COALESCE(SUM(estimated_cost),0) AS cost,
                COALESCE(SUM(total_tokens),0) AS tokens, MAX(created_at) AS last
           FROM llm_usage
          WHERE ${where}
          GROUP BY tenant_id
       ) u ON u.tenant_id = t.id
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS agt
           FROM agent_call_traces
          WHERE ${where}
          GROUP BY tenant_id
       ) a ON a.tenant_id = t.id
      ORDER BY COALESCE(u.llm, 0) DESC`,
    vals,
  )
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    llmCalls: r.llm,
    agentCalls: r.agt,
    totalTokens: r.tokens,
    estimatedCost: r.cost,
    lastUsedAt: r.last,
  }))
}

export async function listTenantQuotas(): Promise<{
  tenantId: string; tenantName: string; maxCalls: number | null; maxTokens: number | null;
  maxCost: number | null; period: string; updatedAt: string
}[]> {
  const { rows } = await pool.query<{
    tenant_id: string; name: string; max_calls: number | null; max_tokens: number | null;
    max_cost: string | null; period: string; updated_at: string
  }>(
    `SELECT q.tenant_id, t.name, q.max_calls, q.max_tokens, q.max_cost, q.period, q.updated_at
       FROM tenant_quotas q
       JOIN tenants t ON t.id = q.tenant_id
      ORDER BY t.name`,
  )
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    tenantName: r.name,
    maxCalls: r.max_calls,
    maxTokens: r.max_tokens,
    maxCost: r.max_cost != null ? Number(r.max_cost) : null,
    period: r.period,
    updatedAt: r.updated_at,
  }))
}

export async function upsertTenantQuota(
  tenantId: Id,
  input: { maxCalls?: number | null; maxTokens?: number | null; maxCost?: number | null; period?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_quotas (tenant_id, max_calls, max_tokens, max_cost, period, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (tenant_id)
     DO UPDATE SET max_calls = $2, max_tokens = $3, max_cost = $4, period = $5, updated_at = now()`,
    [tenantId, input.maxCalls ?? null, input.maxTokens ?? null, input.maxCost ?? null, input.period ?? 'monthly'],
  )
}

export async function quotaUsageForTenant(
  tenantId: Id,
  period: string,
): Promise<{ calls: number; tokens: number; cost: number }> {
  const cycle = period === 'yearly' ? `date_trunc('year', now())` : `date_trunc('month', now())`
  const { rows } = await pool.query<{ c: string; t: string; k: string }>(
    `SELECT COUNT(*)::text AS c,
            COALESCE(SUM(total_tokens),0)::text AS t,
            COALESCE(SUM(estimated_cost),0)::text AS k
       FROM llm_usage
      WHERE tenant_id = $1 AND created_at >= ${cycle}`,
    [tenantId],
  )
  return { calls: Number(rows[0]?.c ?? 0), tokens: Number(rows[0]?.t ?? 0), cost: Number(rows[0]?.k ?? 0) }
}

export async function getTenantQuota(tenantId: Id): Promise<{
  maxCalls: number | null; maxTokens: number | null; maxCost: number | null; period: string
} | null> {
  const { rows } = await pool.query<{
    max_calls: number | null; max_tokens: number | null; max_cost: string | null; period: string
  }>(
    'SELECT max_calls, max_tokens, max_cost, period FROM tenant_quotas WHERE tenant_id = $1',
    [tenantId],
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    maxCalls: r.max_calls,
    maxTokens: r.max_tokens,
    maxCost: r.max_cost != null ? Number(r.max_cost) : null,
    period: r.period,
  }
}

// N7 配额超限告警：同标题 24h 内去重，落库站内通知
export async function recordQuotaAlert(
  tenantId: Id,
  input: { title: string; message: string },
): Promise<void> {
  try {
    const dup = await pool.query<{ one: string }>(
      `SELECT 1::text AS one FROM alerts
        WHERE tenant_id = $1 AND title = $2 AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1`,
      [tenantId, input.title],
    )
    if (dup.rows.length) return
    await pool.query(
      `INSERT INTO alerts (tenant_id, severity, title, message, payload, channel, status)
       VALUES ($1, 'warning', $2, $3, $4, 'system', 'unread')`,
      [tenantId, input.title, input.message, JSON.stringify({ source: 'quota', at: new Date().toISOString() })],
    )
  } catch (e) {
    console.error('[quota alert] insert failed:', e)
  }
}


/* ---------- wallet & recharge (N7-pay) ---------- */

export async function getWalletBalance(tenantId: Id): Promise<number> {
  await ensureWallet(tenantId)
  const { rows } = await pool.query<{ balance: string }>(
    'SELECT balance FROM tenant_wallets WHERE tenant_id = $1',
    [tenantId],
  )
  return Number(rows[0]?.balance ?? 0)
}

export async function ensureWallet(tenantId: Id): Promise<void> {
  await pool.query(
    'INSERT INTO tenant_wallets(tenant_id) VALUES($1) ON CONFLICT (tenant_id) DO NOTHING',
    [tenantId],
  )
}

function genOrderNo(): string {
  const d = new Date()
  const ts = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}${String(d.getUTCSeconds()).padStart(2,'0')}`
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `RC${ts}${rand}`
}

export async function createRechargeOrder(
  tenantId: Id,
  input: { amountYuan: number; channel: string },
): Promise<{ id: string; orderNo: string; amountYuan: number; channel: string; status: string; expiresAt: string }> {
  await ensureWallet(tenantId)
  const orderNo = genOrderNo()
  const { rows } = await pool.query<{
    id: string; order_no: string; amount_yuan: string; channel: string; status: string; expires_at: string
  }>(
    `INSERT INTO recharge_orders (order_no, tenant_id, amount_yuan, channel)
     VALUES ($1, $2, $3, $4)
     RETURNING id, order_no, amount_yuan, channel, status, expires_at`,
    [orderNo, tenantId, input.amountYuan, input.channel],
  )
  return {
    id: rows[0].id,
    orderNo: rows[0].order_no,
    amountYuan: Number(rows[0].amount_yuan),
    channel: rows[0].channel,
    status: rows[0].status,
    expiresAt: rows[0].expires_at,
  }
}

export async function getRechargeOrderByNo(orderNo: string): Promise<{
  id: string; tenantId: string; amountYuan: number; channel: string; status: string; paidAt: string | null; createdAt: string; notifyPayload: unknown | null
} | null> {
  const { rows } = await pool.query<{
    id: string; tenant_id: string; amount_yuan: string; channel: string; status: string; paid_at: string | null; created_at: string; notify_payload: unknown | null
  }>(
    `SELECT id, tenant_id, amount_yuan, channel, status, paid_at, created_at, notify_payload
       FROM recharge_orders WHERE order_no = $1`,
    [orderNo],
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    id: r.id, tenantId: r.tenant_id, amountYuan: Number(r.amount_yuan),
    channel: r.channel, status: r.status, paidAt: r.paid_at, createdAt: r.created_at, notifyPayload: r.notify_payload,
  }
}

export async function listRechargeOrders(tenantId: Id, limit = 20): Promise<{
  id: string; orderNo: string; amountYuan: number; channel: string; status: string; createdAt: string; paidAt: string | null
}[]> {
  const { rows } = await pool.query<{
    id: string; order_no: string; amount_yuan: string; channel: string; status: string; created_at: string; paid_at: string | null
  }>(
    `SELECT id, order_no, amount_yuan, channel, status, created_at, paid_at
       FROM recharge_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, Math.min(Math.max(Number(limit) || 20, 1), 100)],
  )
  return rows.map((r) => ({
    id: r.id, orderNo: r.order_no, amountYuan: Number(r.amount_yuan),
    channel: r.channel, status: r.status, createdAt: r.created_at, paidAt: r.paid_at,
  }))
}

// 标记订单为已支付 + 钱包入账 + 写流水（事务内）
export async function markOrderPaidAndCredit(
  orderNo: string,
  notifyPayload: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: ordRows } = await client.query<{ id: string; tenant_id: string; amount_yuan: string; status: string }>(
      "SELECT id, tenant_id, amount_yuan, status FROM recharge_orders WHERE order_no = $1 FOR UPDATE",
      [orderNo],
    )
    if (!ordRows.length) { await client.query('ROLLBACK'); return { ok: false, reason: 'order_not_found' } }
    const order = ordRows[0]
    if (order.status === 'paid') { await client.query('ROLLBACK'); return { ok: true } }
    if (order.status !== 'pending') { await client.query('ROLLBACK'); return { ok: false, reason: `order_status=${order.status}` } }

    await client.query(
      "UPDATE recharge_orders SET status='paid', paid_at=now(), notify_payload=$1, notify_at=now() WHERE id=$2",
      [JSON.stringify(notifyPayload), order.id],
    )
    await client.query(
      "INSERT INTO tenant_wallets(tenant_id, balance) VALUES($1, $2) ON CONFLICT(tenant_id) DO UPDATE SET balance = tenant_wallets.balance + $2, updated_at = now()",
      [order.tenant_id, order.amount_yuan],
    )
    const { rows: bal } = await client.query<{ balance: string }>(
      'SELECT balance FROM tenant_wallets WHERE tenant_id = $1',
      [order.tenant_id],
    )
    await client.query(
      `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
       VALUES ($1, 'recharge', $2, $3, 'order', $4, $5)`,
      [order.tenant_id, order.amount_yuan, bal[0].balance, order.id, `虎皮椒/订单 ${orderNo}`],
    )
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[wallet] markOrderPaidAndCredit failed:', e)
    return { ok: false, reason: 'db_error' }
  } finally {
    client.release()
  }
}

// LLM 调用后扣减余额（事务内，避免超额）
export async function chargeWalletForLlm(
  tenantId: Id,
  costUsd: number,
  ref: { kind: 'chat' | 'embedding' | 'tool'; refId?: string; remark?: string },
): Promise<{ ok: boolean; balanceAfter: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ balance: string }>(
      'SELECT balance FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE',
      [tenantId],
    )
    const before = Number(rows[0]?.balance ?? 0)
    if (before < costUsd) {
      await client.query('ROLLBACK')
      return { ok: false, balanceAfter: before }
    }
    const after = before - costUsd
    await client.query('UPDATE tenant_wallets SET balance = $2, updated_at = now() WHERE tenant_id = $1', [tenantId, after])
    await client.query(
      `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
       VALUES ($1, 'consume', $2, $3, 'usage', $4, $5)`,
      [tenantId, -costUsd, after, ref.refId ?? null, ref.remark ?? `${ref.kind} 调用`],
    )
    await client.query('COMMIT')
    return { ok: true, balanceAfter: after }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[wallet] chargeWalletForLlm failed:', e)
    return { ok: false, balanceAfter: 0 }
  } finally {
    client.release()
  }
}

export async function listWalletTransactions(tenantId: Id, limit = 50): Promise<{
  id: string; kind: string; amount: number; balanceAfter: number; refType: string | null; refId: string | null; remark: string | null; createdAt: string
}[]> {
  const { rows } = await pool.query<{
    id: string; kind: string; amount: string; balance_after: string; ref_type: string | null; ref_id: string | null; remark: string | null; created_at: string
  }>(
    `SELECT id, kind, amount, balance_after, ref_type, ref_id, remark, created_at
       FROM wallet_transactions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, Math.min(Math.max(Number(limit) || 50, 1), 200)],
  )
  return rows.map((r) => ({
    id: r.id, kind: r.kind, amount: Number(r.amount), balanceAfter: Number(r.balance_after),
    refType: r.ref_type, refId: r.ref_id, remark: r.remark, createdAt: r.created_at,
  }))
}

export async function getPaymentSetting(key: string): Promise<string> {
  const { rows } = await pool.query<{ value: string | null }>(
    'SELECT value FROM payment_settings WHERE key = $1',
    [key],
  )
  return rows[0]?.value ?? ''
}

export async function getAllPaymentSettings(): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ key: string; value: string | null }>('SELECT key, value FROM payment_settings')
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value ?? ''
  return out
}

export async function setPaymentSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO payment_settings(key, value, updated_at) VALUES($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value],
  )
}

export async function adjustWallet(
  tenantId: Id,
  delta: number,
  remark: string,
): Promise<{ ok: boolean; balanceAfter: number; reason?: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO tenant_wallets(tenant_id) VALUES($1) ON CONFLICT DO NOTHING', [tenantId])
    const { rows } = await client.query<{ balance: string }>(
      'SELECT balance FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE', [tenantId],
    )
    const before = Number(rows[0]?.balance ?? 0)
    const after = before + Number(delta)
    if (after < 0) { await client.query('ROLLBACK'); return { ok: false, balanceAfter: before, reason: '余额不能为负' } }
    await client.query('UPDATE tenant_wallets SET balance = $2, updated_at = now() WHERE tenant_id = $1', [tenantId, after])
    await client.query(
      `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
       VALUES ($1, 'adjust', $2, $3, 'manual', NULL, $4)`,
      [tenantId, Number(delta), after, remark],
    )
    await client.query('COMMIT')
    return { ok: true, balanceAfter: after }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[wallet] adjust failed:', e)
    return { ok: false, balanceAfter: 0, reason: 'db_error' }
  } finally {
    client.release()
  }
}


/* ---------- billing / plans / subscription (P1 商业化) ---------- */

export type BillingMode = 'payg' | 'subscription'
export type OverageStrategy = 'cap' | 'payg'

export async function getTenantBillingMode(tenantId: Id): Promise<BillingMode> {
  const { rows } = await pool.query<{ billing_mode: string }>(
    'SELECT billing_mode FROM tenants WHERE id = $1', [tenantId],
  )
  return (rows[0]?.billing_mode as BillingMode) || 'payg'
}

export async function setTenantBillingMode(tenantId: Id, mode: BillingMode): Promise<{ ok: boolean; reason?: string }> {
  if (mode === 'subscription') {
    const sub = await getActiveSubscription(tenantId)
    if (!sub) return { ok: false, reason: 'no_active_subscription' }
  }
  await pool.query('UPDATE tenants SET billing_mode = $2 WHERE id = $1', [tenantId, mode])
  return { ok: true }
}

export type Plan = {
  id: string; name: string; description: string | null
  price: number; period: 'monthly' | 'yearly'
  includedCalls: number; includedTokens: number; includedExecutions: number
  overageStrategy: OverageStrategy; sortOrder: number; active: boolean
}

export async function listPlans(): Promise<Plan[]> {
  const { rows } = await pool.query<{
    id: string; name: string; description: string | null; price: string; period: string
    included_calls: number; included_tokens: number; included_executions: number
    overage_strategy: string; sort_order: number; active: boolean
  }>(
    `SELECT id, name, description, price, period, included_calls, included_tokens,
            included_executions, overage_strategy, sort_order, active
       FROM plans WHERE active = true ORDER BY sort_order ASC, price ASC`,
  )
  return rows.map(mapPlan)
}

export async function getPlan(planId: Id): Promise<Plan | null> {
  const { rows } = await pool.query<{
    id: string; name: string; description: string | null; price: string; period: string
    included_calls: number; included_tokens: number; included_executions: number
    overage_strategy: string; sort_order: number; active: boolean
  }>(
    `SELECT id, name, description, price, period, included_calls, included_tokens,
            included_executions, overage_strategy, sort_order, active
       FROM plans WHERE id = $1`, [planId],
  )
  return rows[0] ? mapPlan(rows[0]) : null
}

function mapPlan(r: {
  id: string; name: string; description: string | null; price: string; period: string
  included_calls: number; included_tokens: number; included_executions: number
  overage_strategy: string; sort_order: number; active: boolean
}): Plan {
  return {
    id: r.id, name: r.name, description: r.description,
    price: Number(r.price), period: r.period as 'monthly' | 'yearly',
    includedCalls: Number(r.included_calls), includedTokens: Number(r.included_tokens),
    includedExecutions: Number(r.included_executions),
    overageStrategy: r.overage_strategy as OverageStrategy,
    sortOrder: Number(r.sort_order), active: r.active,
  }
}

export type SubscriptionView = {
  id: string; planId: string; planName: string; status: string
  startedAt: string; endsAt: string
  includedCalls: number; includedTokens: number; includedExecutions: number
  usedCalls: number; usedTokens: number; usedExecutions: number
  overageStrategy: OverageStrategy
}

// 取当前有效订阅（status=active 且未到期）
export async function getActiveSubscription(tenantId: Id): Promise<SubscriptionView | null> {
  const { rows } = await pool.query<{
    id: string; plan_id: string; plan_name: string; status: string
    started_at: string; ends_at: string
    included_calls: number; included_tokens: number; included_executions: number
    used_calls: number; used_tokens: number; used_executions: number
    overage_strategy: string
  }>(
    `SELECT s.id, s.plan_id, p.name AS plan_name, s.status, s.started_at, s.ends_at,
            s.included_calls, s.included_tokens, s.included_executions,
            s.used_calls, s.used_tokens, s.used_executions, s.overage_strategy
       FROM tenant_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = $1 AND s.status = 'active' AND s.ends_at > now()
      ORDER BY s.ends_at DESC LIMIT 1`,
    [tenantId],
  )
  return rows[0] ? mapSubscription(rows[0]) : null
}

function mapSubscription(r: {
  id: string; plan_id: string; plan_name: string; status: string
  started_at: string; ends_at: string
  included_calls: number; included_tokens: number; included_executions: number
  used_calls: number; used_tokens: number; used_executions: number
  overage_strategy: string
}): SubscriptionView {
  return {
    id: r.id, planId: r.plan_id, planName: r.plan_name, status: r.status,
    startedAt: r.started_at, endsAt: r.ends_at,
    includedCalls: Number(r.included_calls), includedTokens: Number(r.included_tokens),
    includedExecutions: Number(r.included_executions),
    usedCalls: Number(r.used_calls), usedTokens: Number(r.used_tokens),
    usedExecutions: Number(r.used_executions),
    overageStrategy: r.overage_strategy as OverageStrategy,
  }
}

// 给前端展示：当前订阅（含已到期/已取消的历史最新一条，便于提示）
export async function getSubscriptionUsage(tenantId: Id): Promise<SubscriptionView | null> {
  const { rows } = await pool.query<{
    id: string; plan_id: string; plan_name: string; status: string
    started_at: string; ends_at: string
    included_calls: number; included_tokens: number; included_executions: number
    used_calls: number; used_tokens: number; used_executions: number
    overage_strategy: string
  }>(
    `SELECT s.id, s.plan_id, p.name AS plan_name, s.status, s.started_at, s.ends_at,
            s.included_calls, s.included_tokens, s.included_executions,
            s.used_calls, s.used_tokens, s.used_executions, s.overage_strategy
       FROM tenant_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = $1
      ORDER BY s.created_at DESC LIMIT 1`,
    [tenantId],
  )
  return rows[0] ? mapSubscription(rows[0]) : null
}

export async function createSubscription(
  tenantId: Id,
  planId: Id,
): Promise<{ ok: boolean; reason?: string; subscription?: SubscriptionView; balanceAfter?: number }> {
  const plan = await getPlan(planId)
  if (!plan || !plan.active) return { ok: false, reason: 'plan_not_found' }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // 先取消已有 active 订阅（避免叠加）
    await client.query(
      `UPDATE tenant_subscriptions SET status = 'cancelled'
        WHERE tenant_id = $1 AND status = 'active' AND ends_at > now()`,
      [tenantId],
    )
    // 从钱包扣套餐费
    const balRes = await client.query<{ balance: string }>(
      'SELECT balance FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE', [tenantId],
    )
    const before = Number(balRes.rows[0]?.balance ?? 0)
    if (before < plan.price) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'wallet_insufficient' }
    }
    const after = before - plan.price
    await client.query('UPDATE tenant_wallets SET balance = $2, updated_at = now() WHERE tenant_id = $1', [tenantId, after])
    await client.query(
      `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
       VALUES ($1, 'subscribe', $2, $3, 'plan', $4, $5)`,
      [tenantId, -plan.price, after, planId, `订阅套餐 ${plan.name}`],
    )
    const interval = plan.period === 'yearly' ? '1 year' : '1 month'
    const ins = await client.query<{
      id: string; plan_id: string; plan_name: string; status: string; started_at: string; ends_at: string
      included_calls: number; included_tokens: number; included_executions: number
      used_calls: number; used_tokens: number; used_executions: number; overage_strategy: string
    }>(
      `INSERT INTO tenant_subscriptions
         (tenant_id, plan_id, status, started_at, ends_at,
          included_calls, included_tokens, included_executions,
          used_calls, used_tokens, used_executions, overage_strategy)
       VALUES ($1, $2, 'active', now(), now() + $3::interval,
          $4, $5, $6, 0, 0, 0, $7)
       RETURNING id, plan_id, (SELECT name FROM plans WHERE id = $2) AS plan_name,
                 status, started_at, ends_at, included_calls, included_tokens,
                 included_executions, used_calls, used_tokens, used_executions, overage_strategy`,
      [tenantId, planId, interval, plan.includedCalls, plan.includedTokens, plan.includedExecutions, plan.overageStrategy],
    )
    await client.query('UPDATE tenants SET billing_mode = $2 WHERE id = $1', [tenantId, 'subscription'])
    await client.query('COMMIT')
    return { ok: true, subscription: mapSubscription(ins.rows[0]), balanceAfter: after }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[billing] createSubscription failed:', e)
    return { ok: false, reason: 'db_error' }
  } finally {
    client.release()
  }
}

export async function cancelSubscription(tenantId: Id): Promise<{ ok: boolean; reason?: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(
      `UPDATE tenant_subscriptions SET status = 'cancelled'
        WHERE tenant_id = $1 AND status = 'active' AND ends_at > now()`,
      [tenantId],
    )
    await client.query('UPDATE tenants SET billing_mode = $2 WHERE id = $1', [tenantId, 'payg'])
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[billing] cancelSubscription failed:', e)
    return { ok: false, reason: 'db_error' }
  } finally {
    client.release()
  }
}

export type UsageInput = {
  calls?: number; tokens?: number; executions?: number; costUsd?: number
  kind?: 'chat' | 'tool' | 'embedding'
  refId?: string; remark?: string
}

// 统一扣费入口：根据租户 billing_mode 路由
//  - subscription：优先扣套餐额度；超额按 overage_strategy（cap 拒绝 / payg 转钱包）
//  - payg：按 costUsd 扣钱包
export async function consumeUsage(
  tenantId: Id,
  usage: UsageInput,
): Promise<{ ok: boolean; reason?: string; billedBy?: 'subscription' | 'wallet' }> {
  const calls = usage.calls ?? 0
  const tokens = usage.tokens ?? 0
  const executions = usage.executions ?? 0
  const costUsd = usage.costUsd ?? 0
  if (usage.kind === 'embedding') return { ok: true } // embedding 不计费

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const modeRes = await client.query<{ billing_mode: string }>(
      'SELECT billing_mode FROM tenants WHERE id = $1 FOR UPDATE', [tenantId],
    )
    let mode: BillingMode = (modeRes.rows[0]?.billing_mode as BillingMode) || 'payg'

    if (mode === 'subscription') {
      const subRes = await client.query<{
        id: string; included_calls: number; included_tokens: number; included_executions: number
        used_calls: number; used_tokens: number; used_executions: number; overage_strategy: string
      }>(
        `SELECT id, included_calls, included_tokens, included_executions,
                used_calls, used_tokens, used_executions, overage_strategy
           FROM tenant_subscriptions
          WHERE tenant_id = $1 AND status = 'active' AND ends_at > now()
          ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`,
        [tenantId],
      )
      if (subRes.rows.length) {
        const sub = subRes.rows[0]
        const remainCalls = Number(sub.included_calls) - Number(sub.used_calls)
        const remainTokens = Number(sub.included_tokens) - Number(sub.used_tokens)
        const remainExec = Number(sub.included_executions) - Number(sub.used_executions)
        const overCalls = Math.max(0, calls - Math.max(0, remainCalls))
        const overTokens = Math.max(0, tokens - Math.max(0, remainTokens))
        const overExec = Math.max(0, executions - Math.max(0, remainExec))
        const hasOver = overCalls > 0 || overTokens > 0 || overExec > 0
        // 累加套餐已用额度
        await client.query(
          `UPDATE tenant_subscriptions
              SET used_calls = used_calls + $2, used_tokens = used_tokens + $3,
                  used_executions = used_executions + $4 WHERE id = $1`,
          [sub.id, calls, tokens, executions],
        )
        if (hasOver && sub.overage_strategy === 'cap') {
          // 仍记录已用额度（上面已累加 used_），让后续请求与前端能识别"已用尽"
          await client.query('COMMIT')
          return { ok: false, reason: 'subscription_quota_exhausted' }
        }
        if (hasOver && sub.overage_strategy === 'payg' && costUsd > 0) {
          const balRes = await client.query<{ balance: string }>(
            'SELECT balance FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE', [tenantId],
          )
          const before = Number(balRes.rows[0]?.balance ?? 0)
          if (before < costUsd) {
            await client.query('ROLLBACK')
            return { ok: false, reason: 'wallet_insufficient' }
          }
          const after = before - costUsd
          await client.query('UPDATE tenant_wallets SET balance = $2, updated_at = now() WHERE tenant_id = $1', [tenantId, after])
          await client.query(
            `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
             VALUES ($1, 'consume', $2, $3, 'usage', $4, $5)`,
            [tenantId, -costUsd, after, sub.id, usage.remark ?? '套餐超额按量'],
          )
        }
        await client.query('COMMIT')
        return { ok: true, billedBy: 'subscription' }
      }
      // 无有效订阅，降级 payg
      mode = 'payg'
    }

    // payg：扣钱包
    if (costUsd > 0) {
      const balRes = await client.query<{ balance: string }>(
        'SELECT balance FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE', [tenantId],
      )
      const before = Number(balRes.rows[0]?.balance ?? 0)
      if (before < costUsd) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'wallet_insufficient' }
      }
      const after = before - costUsd
      await client.query('UPDATE tenant_wallets SET balance = $2, updated_at = now() WHERE tenant_id = $1', [tenantId, after])
      await client.query(
        `INSERT INTO wallet_transactions (tenant_id, kind, amount, balance_after, ref_type, ref_id, remark)
         VALUES ($1, 'consume', $2, $3, 'usage', $4, $5)`,
        [tenantId, -costUsd, after, usage.refId ?? null, usage.remark ?? '按量扣费'],
      )
    }
    await client.query('COMMIT')
    return { ok: true, billedBy: 'wallet' }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[billing] consumeUsage failed:', e)
    return { ok: false, reason: 'db_error' }
  } finally {
    client.release()
  }
}
