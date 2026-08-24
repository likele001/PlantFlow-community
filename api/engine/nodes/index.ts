import { nodeRegistry } from './registry.js'
import { triggerManual, triggerWebhook, triggerCron, triggerWecom, triggerFeishu, triggerDingtalk, triggerTaobao, triggerChat, triggerMes } from './triggers.js'
import { logicIf, logicSwitch, logicLoop, logicSet, logicDelay, logicParallel, logicMerge, workflowSub } from './logic.js'
import { aiChat, aiKnowledge, aiAgent, createEmbedding } from './ai.js'
import { httpRequest, channelSend } from './integration.js'
import { logicCode } from './code.js'
import { logicTry, logicCatch } from './trycatch.js'
import { logicJsonParse, logicSplit, logicJoin, logicDate } from './data.js'
import { wecomListDepartments, wecomListUsers, wecomSendNews } from './wecom.js'
import { feishuListDepartments, feishuListUsers, feishuCreateRecord, feishuCreateEvent } from './feishu.js'

nodeRegistry.register(triggerManual)
nodeRegistry.register(triggerWebhook)
nodeRegistry.register(triggerCron)
nodeRegistry.register(triggerWecom)
nodeRegistry.register(triggerFeishu)
nodeRegistry.register(triggerDingtalk)
nodeRegistry.register(triggerTaobao)
nodeRegistry.register(triggerChat)
nodeRegistry.register(triggerMes)
nodeRegistry.register(logicIf)
nodeRegistry.register(logicSwitch)
nodeRegistry.register(logicLoop)
nodeRegistry.register(logicSet)
nodeRegistry.register(logicDelay)
nodeRegistry.register(logicParallel)
nodeRegistry.register(logicMerge)
nodeRegistry.register(workflowSub)
nodeRegistry.register(aiChat)
nodeRegistry.register(aiKnowledge)
nodeRegistry.register(aiAgent)
nodeRegistry.register(httpRequest)
nodeRegistry.register(channelSend)
nodeRegistry.register(logicCode)
nodeRegistry.register(logicTry)
nodeRegistry.register(logicCatch)
nodeRegistry.register(logicJsonParse)
nodeRegistry.register(logicSplit)
nodeRegistry.register(logicJoin)
nodeRegistry.register(logicDate)
// 企业微信增强节点
nodeRegistry.register(wecomListDepartments)
nodeRegistry.register(wecomListUsers)
nodeRegistry.register(wecomSendNews)
// 飞书增强节点
nodeRegistry.register(feishuListDepartments)
nodeRegistry.register(feishuListUsers)
nodeRegistry.register(feishuCreateRecord)
nodeRegistry.register(feishuCreateEvent)

export { nodeRegistry, createEmbedding }
export { searchKnowledge } from './ai.js'
