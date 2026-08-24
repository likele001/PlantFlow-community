import vm from 'node:vm'
import type { NodeExecutor } from './registry.js'
import { renderTemplate } from '../template.js'

export const logicCode: NodeExecutor = {
  type: 'logic.code',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const code = renderTemplate(String(cfg.code ?? ''), ctx)
    if (!code.trim()) return { result: undefined }

    const ctxProxy = Object.create(null)
    ctxProxy.trigger = ctx.trigger
    ctxProxy.steps = ctx.steps
    ctxProxy.vars = ctx.vars
    ctxProxy._ctx = ctx

    const sandbox = Object.create(null)
    sandbox.$ = ctxProxy
    sandbox.console = console
    sandbox.JSON = JSON
    sandbox.Math = Math
    sandbox.Date = Date
    sandbox.parseInt = parseInt
    sandbox.parseFloat = parseFloat
    sandbox.String = String
    sandbox.Number = Number
    sandbox.Boolean = Boolean
    sandbox.Array = Array
    sandbox.RegExp = RegExp

    try {
      const result = vm.runInNewContext(
        '(function(){' + code + '\n})()',
        sandbox,
        { timeout: Number(cfg.timeout ?? 5000) },
      )
      return { result, type: typeof result }
    } catch (e: unknown) {
      throw new Error(`Code 节点执行失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
}
