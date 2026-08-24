/**
 * This is a API server
 */

import fs from 'node:fs'
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import tenantRoutes from './routes/tenants.js'
import workflowRoutes from './routes/workflows.js'
import conversationRoutes from './routes/conversations.js'
import channelRoutes from './routes/channels.js'
import taobaoRoutes from './routes/taobao.js'
import storeProfileRoutes from './routes/store-profile.js'
import botWizardRoutes from './routes/bot-wizard.js'
import aiRoutes from './routes/ai.js'
import executionRoutes from './routes/executions.js'
import knowledgeRoutes from './routes/knowledge.js'
import connectorRoutes from './routes/connectors.js'
import dashboardRoutes from './routes/dashboard.js'
import credentialRoutes from './routes/credentials.js'
import hooksRoutes from './routes/hooks.js'
import appsRoutes from './routes/apps.js'
import chatApiRoutes from './routes/chat-api.js'
import healthRoutes from './routes/health.js'
import botRoutes from './routes/bot.js'
import engineRoutes from './routes/engine.js'
import promptRoutes from './routes/prompts.js'
import dataAccessRoutes from './routes/data-access.js'
import agentRoutes from './routes/agents.js'
import scenarioRoutes from './routes/scenarios.js'
import aiBuildRoutes from './routes/ai-build.js'
import alertsRoutes from './routes/alerts.js'
import cronRoutes from './routes/cron.js'
import observabilityRoutes from './routes/observability.js'
import { requireAuth } from './middleware/auth.js'
import { initDb } from './db.js'
import { rateLimit, keyFromIp, keyFromIpUrl } from './middleware/rateLimit.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// F3: 全局限流（宽松兜底，防极端滥用）
app.use(rateLimit({ windowMs: 60_000, max: 900, key: keyFromIp }))
// 登录防暴力破解
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 15, key: keyFromIp }))
// 公开 webhook 触发（按 keyFromIpUrl，各 webhook 独立配额）
app.use('/api/hooks', rateLimit({ windowMs: 60_000, max: 30, key: keyFromIpUrl }))
// 高成本 AI / 对话入口
app.use('/api/ai', rateLimit({ windowMs: 60_000, max: 60, key: keyFromIp }))
app.use('/api/v1/chat', rateLimit({ windowMs: 60_000, max: 40, key: keyFromIp }))
app.use('/api/bot', rateLimit({ windowMs: 60_000, max: 40, key: keyFromIp }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/hooks', hooksRoutes)
app.use('/api/v1/chat', chatApiRoutes)
app.use('/api/apps', requireAuth, appsRoutes)
app.use('/api/tenants', requireAuth, tenantRoutes)
app.use('/api/workflows', requireAuth, workflowRoutes)
app.use('/api/conversations', requireAuth, conversationRoutes)
app.use('/api/channels', channelRoutes)
app.use('/api/channels', taobaoRoutes)
app.use('/api', storeProfileRoutes)
app.use('/api/bot-wizard', requireAuth, botWizardRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/executions', requireAuth, executionRoutes)
app.use('/api/knowledge', requireAuth, knowledgeRoutes)
app.use('/api/connectors', requireAuth, connectorRoutes)
app.use('/api/dashboard', requireAuth, dashboardRoutes)
app.use('/api/credentials', requireAuth, credentialRoutes())
app.use('/api/data-access', requireAuth, dataAccessRoutes)
app.use('/api/agents', requireAuth, agentRoutes)
app.use('/api/scenarios', requireAuth, scenarioRoutes)
app.use('/api/ai-build', requireAuth, aiBuildRoutes)
app.use('/api/alerts', requireAuth, alertsRoutes)
app.use('/api/cron', requireAuth, cronRoutes)
app.use('/api/observability', requireAuth, observabilityRoutes)
// 支付通道回调 / 同步跳转必须公开（虎皮椒没有 token），其他接口鉴权
app.use('/api/engine', requireAuth, engineRoutes)
app.use('/api/bot', botRoutes)
app.use('/api', promptRoutes)

/**
 * 前端静态资源（Docker 单容器 / 无 Nginx 时也能打开页面）
 * 编译后 dist 与 dist-api 同级：../dist
 */
const distDir = path.resolve(__dirname, '../dist')
const docsDir = path.resolve(__dirname, '../docs')
const indexHtml = path.join(distDir, 'index.html')

if (fs.existsSync(indexHtml)) {
  app.use(express.static(distDir))
  app.use('/docs', express.static(docsDir))
  app.get(/^(?!\/api).*/, (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    res.sendFile(indexHtml, (err) => {
      if (err) next(err)
    })
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error', error)
  if (req.path.startsWith('/api')) {
    res.status(500).json({ success: false, error: 'Server internal error' })
    return
  }
  res.status(500).send('Server internal error')
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, error: 'API not found' })
    return
  }
  res.status(404).send('Not found')
})

export { initDb }
export default app
