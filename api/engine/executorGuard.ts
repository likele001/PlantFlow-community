// api/engine/executorGuard.ts
// F2: 执行器超时 / 取消 / 循环上限保护

// 默认超时参数（可环境变量覆盖）
export const EXEC_TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS ?? 60_000) // 整体执行超时
export const NODE_TIMEOUT_MS = Number(process.env.NODE_TIMEOUT_MS ?? 10_000) // 单节点超时
export const MAX_LOOP_ITEMS = Number(process.env.MAX_LOOP_ITEMS ?? 500) // 循环最大项数
export const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 20) // 最大嵌套深度

/**
 * 节点级超时包装：用 Promise.race 超过 NODE_TIMEOUT_MS 的节点执行将被中止。
 * 返回的 err 非空时表示超时。
 */
export async function withNodeTimeout<T extends () => Promise<unknown>>(
  fn: T,
  timeoutMs: number = NODE_TIMEOUT_MS,
  label = 'node',
): Promise<{ ok: true; data: Awaited<ReturnType<T>> } | { ok: false; error: string }> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 执行超时（${timeoutMs}ms）`)), timeoutMs)
      }),
    ])
    return { ok: true, data: result as Awaited<ReturnType<T>> }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 整体执行超时检查：维护一个可共享的最终期限，超时后所有节点快速失败。
 */
export function makeDeadline(timeoutMs: number = EXEC_TIMEOUT_MS): () => number {
  const deadline = Date.now() + timeoutMs
  return () => deadline
}

/** 是否已超时 */
export function isPastDeadline(deadlineFn: () => number): boolean {
  return Date.now() > deadlineFn()
}

/** 剩余毫秒 */
export function remainingMs(deadlineFn: () => number): number {
  return Math.max(0, deadlineFn() - Date.now())
}