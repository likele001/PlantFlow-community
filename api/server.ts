/**
 * local server entry file, for local development
 */
import app, { initDb } from './app.js'
import { startExecutionWorker } from './engine/queue.js'
import { startScheduler } from './engine/scheduler.js'

/**
 * start server with port
 */
const PORT = process.env.PORT || 5000

// F4: 兜底未处理的 Promise rejection。Express 4 不会自动捕获 async handler 抛出的
// rejection，若不拦截，任意单请求的 async 错误（如 PG 参数类型异常）都会导致
// 整个进程崩溃（DoS 面）。这里吞掉并记录，避免单请求击垮服务。
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

async function main() {
  await initDb()
  startExecutionWorker()
  startScheduler()

  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`)
  })

  const shutdown = (sig: string) => {
    console.log(`${sig} signal received`)
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Fatal startup error', err)
  process.exit(1)
})
