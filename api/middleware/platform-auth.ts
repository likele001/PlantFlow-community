// api/middleware/platform-auth.ts
// 平台后台鉴权中间件。
// 与 requireAuth 不同：只接受 sessions.kind='platform' 的 token，并且不绑定 tenantId。

import type { NextFunction, Request, Response } from 'express'
import { db } from '../store.js'
import { computePermissions, type Role } from './rbac.js'

export type PlatformAuthedRequest = Request & {
  platformAuth?: {
    userId: string
    role: Role
    permissions: string[]
    email: string
  }
}

export async function requirePlatformAdmin(
  req: PlatformAuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers.authorization
  const token =
    typeof raw === 'string' && raw.startsWith('Bearer ')
      ? raw.slice('Bearer '.length)
      : null

  if (!token) {
    res.status(401).json({ success: false, error: '请先登录平台后台' })
    return
  }

  const session = await db.getSession(token)
  if (!session) {
    res.status(401).json({ success: false, error: '会话已过期，请重新登录' })
    return
  }
  if (session.kind !== 'platform') {
    res.status(401).json({ success: false, error: '此 token 不是平台后台会话' })
    return
  }

  // 必须存在一个 role=platform_admin 的 membership（任意 tenant）
  const all = await db.listMembershipsForUser(session.userId)
  const platformAdminMs = all.find((m) => m.role === 'platform_admin')
  if (!platformAdminMs) {
    res.status(403).json({ success: false, error: '您不是平台管理员' })
    return
  }

  const user = await db.findUserById(session.userId)
  req.platformAuth = {
    userId: session.userId,
    role: 'platform_admin',
    permissions: computePermissions('platform_admin'),
    email: user?.email ?? '',
  }
  next()
}