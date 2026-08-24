import type { NodeExecutor } from './registry.js'

const trigger = (type: string): NodeExecutor => ({
  type,
  structural: true,
  async execute({ ctx }) {
    return { ...ctx.trigger }
  },
})

export const triggerManual = trigger('trigger.manual')
export const triggerWebhook = trigger('trigger.webhook')
export const triggerCron = trigger('trigger.cron')
export const triggerWecom = trigger('trigger.wecom')
export const triggerFeishu = trigger('trigger.feishu')
export const triggerDingtalk = trigger('trigger.dingtalk')
export const triggerTaobao = trigger('trigger.taobao')
export const triggerChat = trigger('trigger.chat')
export const triggerMes = trigger('trigger.mes')
