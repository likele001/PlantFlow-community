import { Router, type Response } from 'express'
import { db } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

// 当前用户所属企业列表
router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenants = await db.listTenantsForUser(req.auth!.userId)
  res.json({ success: true, data: tenants })
})

// 生成企业邀请链接（仅企业管理员）
router.post('/invites', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const role = await db.getMembershipRole(req.auth!.userId, req.auth!.tenantId)
  if (role !== 'tenant_admin') {
    res.status(403).json({ success: false, error: '仅企业管理员可生成邀请链接' })
    return
  }
  const { email, role: invRole } = (req.body ?? {}) as { email?: string; role?: string }
  const r = (invRole as any) === 'developer' || (invRole as any) === 'operator' || (invRole as any) === 'agent'
    ? (invRole as any)
    : 'developer'
  try {
    const invite = await db.createTeamInvite(req.auth!.tenantId, {
      email: email ? String(email).trim() : undefined,
      role: r,
      invitedBy: req.auth!.userId,
    })
    res.status(201).json({
      success: true,
      data: {
        id: invite.id,
        token: invite.token,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        inviteUrl: `${process.env.PUBLIC_BASE_URL ?? ''}/login?invite=${invite.token}`,
      },
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '生成邀请失败' })
  }
})

// 邀请列表
router.get('/invites', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const invites = await db.listTeamInvites(req.auth!.tenantId)
  res.json({
    success: true,
    data: invites.map(i => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      createdAt: i.createdAt,
      invitedByEmail: i.invitedByEmail,
    })),
  })
})

// 撤销邀请
router.delete('/invites/:id', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const ok = await db.revokeTeamInvite(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: '邀请不存在' })
    return
  }
  res.json({ success: true, data: null })
})

export default router
