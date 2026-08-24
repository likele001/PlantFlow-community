/**
 * PostgreSQL connection pool + initialization.
 * Runs the SQL migration and seeds demo data on first boot.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://api:changeme@127.0.0.1:5432/api',
  max: 10,
})

export async function initDb(): Promise<void> {
  const migrations = [
    '001_init.sql',
    '002_llm_providers.sql',
    '003_core_features.sql',
    '004_engine_v2.sql',
    '005_versions_apps.sql',
    '006_subworkflow.sql',
    '007_chat_sessions.sql',
    '008_taobao_channel.sql',
    '009_store_profiles.sql',
    '010_credentials.sql',
    '012_embedding_provider.sql',
    '013_bot_assistant.sql',
    '014_dingtalk_channel.sql',
    '015_llm_params.sql',
    '016_prompt_templates.sql',
    '017_kb_chunk_strategy.sql',
    '018_session_expiry.sql',
    '021_queue_reliability.sql',
    '022_data_sources.sql',
    '023_agents.sql',
    '024_scenario_templates.sql',
    '025_csv_uploads.sql',
    '026_alerts.sql',
    '027_rbac_visibility.sql',
    '028_observability.sql',
    '029_tenant_quotas.sql',
    '030_payment_wallet.sql',
    '031_platform_admin.sql',
    '032_mes_triggers.sql',
    '033_team_invites.sql',
    '034_billing_plans.sql',
  ]
  for (const file of migrations) {
    const sqlPath = path.join(__dirname, 'migrations', file)
    const sql = readFileSync(sqlPath, 'utf8')
    await pool.query(sql)
  }

  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM tenants')
  if (Number(rows[0].count) === 0) {
    await seed()
    console.log('[db] seeded demo data')
  } else {
    console.log('[db] schema ready, existing data preserved')
  }

  // Periodically clean up expired sessions
  setInterval(async () => {
    try { await pool.query('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()') }
    catch { /* ignore */ }
  }, 3600_000).unref()
}

async function seed(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const tenantRes = await client.query<{ id: string }>(
      `INSERT INTO tenants (name) VALUES ('示例租户') RETURNING id`,
    )
    const tenantId = tenantRes.rows[0].id

    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, password) VALUES ('admin@example.com', $1) RETURNING id`,
      ['$2b$10$4qNyylaauu.kBKXY9ygEMuY4suLV6HPW.PFKgQSQ0QDaVwtkRXEny'],
    )
    const userId = userRes.rows[0].id

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'tenant_admin')`,
      [tenantId, userId],
    )

    await client.query(
      `INSERT INTO channel_configs (tenant_id) VALUES ($1)`,
      [tenantId],
    )

    await client.query(
      `INSERT INTO workflows (tenant_id, name, status) VALUES
        ($1, '智能客服：知识库问答与转人工', 'draft'),
        ($1, '报工异常：阈值告警推送群', 'draft')`,
      [tenantId],
    )

    await client.query(
      `INSERT INTO conversations (tenant_id, channel, external_id, kind, title) VALUES
        ($1, 'wecom',  'wecom:demo-group',  'group', '设备告警群'),
        ($1, 'feishu', 'feishu:demo-group', 'group', '报工协同群')`,
      [tenantId],
    )

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
