import { Router, type Response } from 'express'
import { db } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/prompts', async (req: AuthedRequest, res: Response) => {
  const list = await db.listPromptTemplates(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/prompts', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {}
  if (!body.name) {
    res.status(400).json({ success: false, error: 'name 必填' })
    return
  }
  const tpl = await db.createPromptTemplate({
    tenantId: req.auth!.tenantId,
    name: String(body.name),
    description: body.description ? String(body.description) : undefined,
    systemPrompt: body.systemPrompt ? String(body.systemPrompt) : undefined,
    userPrompt: body.userPrompt ? String(body.userPrompt) : undefined,
    variables: body.variables,
    tags: body.tags,
    createdBy: req.auth!.userId,
  })
  res.status(201).json({ success: true, data: tpl })
})

router.patch('/prompts/:id', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {}
  const updated = await db.updatePromptTemplate(req.auth!.tenantId, req.params.id, body)
  if (!updated) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: updated })
})

router.delete('/prompts/:id', async (req: AuthedRequest, res: Response) => {
  const ok = await db.deletePromptTemplate(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.post('/prompts/:id/version', async (req: AuthedRequest, res: Response) => {
  const tpl = await db.createPromptTemplateVersion(req.auth!.tenantId, req.params.id)
  if (!tpl) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.status(201).json({ success: true, data: tpl })
})

router.get('/prompts/:id/versions', async (req: AuthedRequest, res: Response) => {
  const tpl = await db.getPromptTemplate(req.auth!.tenantId, req.params.id)
  if (!tpl) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const sourceId = tpl.sourceId ?? tpl.id
  const versions = await db.listPromptTemplateVersions(req.auth!.tenantId, sourceId)
  res.json({ success: true, data: versions })
})

export default router
