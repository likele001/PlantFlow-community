import type { NextFunction, Request, Response } from 'express'
import { db, type Id } from '../store.js'
import { computePermissions, checkSensitiveWrite, type Role } from './rbac.js'

export type AuthedRequest = Request & {
  auth?: {
    userId: Id
    tenantId: Id
    role: Role
    permissions: string[]
  }
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers.authorization
  const token =
    typeof raw === 'string' && raw.startsWith('Bearer ')
      ? raw.slice('Bearer '.length)
      : null

  if (!token) {
    res.status(401).json({ success: false, error: '请先登录' })
    return
  }

  const session = await db.getSession(token)
  if (!session) {
    res.status(401).json({ success: false, error: '会话已过期，请重新登录' })
    return
  }

  const role = (await db.getMembershipRole(session.userId, session.tenantId)) ?? 'agent'
  req.auth = {
    userId: session.userId,
    tenantId: session.tenantId,
    role,
    permissions: computePermissions(role),
  }

  // N8: 敏感资源写操作按角色拦截（读保持放开，避免回归）
  const path = (req.originalUrl || req.url || '').split('?')[0]
  if (!checkSensitiveWrite(path, req.method, role)) {
    res.status(403).json({ success: false, error: '权限不足' })
    return
  }

  next()
}