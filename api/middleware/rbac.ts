import type { NextFunction, Request, Response } from 'express'
import type { Membership } from '../store.js'

export type Role = Membership['role']

// N8: 角色 → 权限矩阵。platform_admin / tenant_admin 拥有全部权限（*）。
// manage 蕴含 view（can() 中处理）。
export const PERMISSIONS: Record<Role, string[]> = {
  platform_admin: ['*'],
  tenant_admin: ['*'],
  developer: [
    'workflow:manage',
    'workflow:view',
    'connector:manage',
    'connector:view',
    'data-source:manage',
    'data-source:view',
    'agent:manage',
    'agent:view',
    'knowledge:manage',
    'knowledge:view',
    'ai-provider:manage',
    'ai-provider:view',
    'prompt:manage',
    'prompt:view',
    'dashboard:view',
    'executions:view',
    'executions:run',
    'alert-subscription:manage',
    'settings:manage',
    'sandbox:run',
  ],
  operator: [
    'workflow:view',
    'connector:view',
    'data-source:view',
    'agent:view',
    'knowledge:view',
    'dashboard:view',
    'executions:view',
    'executions:run',
    'alert-subscription:manage',
  ],
  agent: [
    'dashboard:view',
    'executions:view',
    'executions:run',
    'workflow:view',
    'agent:view',
    'knowledge:view',
    'connector:view',
  ],
}

export function can(role: Role | null | undefined, perm: string): boolean {
  if (!role) return false
  const arr = PERMISSIONS[role] ?? []
  if (arr.includes('*')) return true
  if (arr.includes(perm)) return true
  const idx = perm.indexOf(':')
  if (idx > 0 && perm.slice(idx + 1) === 'view' && arr.includes(perm.slice(0, idx) + ':manage')) {
    return true
  }
  return false
}

const ALL_PERMS = new Set<string>()
for (const roles of Object.values(PERMISSIONS)) {
  for (const p of roles) ALL_PERMS.add(p)
}

export function computePermissions(role: Role | null | undefined): string[] {
  if (!role) return []
  const arr = PERMISSIONS[role] ?? []
  if (arr.includes('*')) return Array.from(ALL_PERMS).filter((p) => p !== '*')
  return arr.filter((p) => p !== '*')
}

// N8: 敏感资源前缀 → 写操作所需权限。这些前缀均已挂在 requireAuth 之后，req.auth 必有值。
export const SENSITIVE_WRITES: Array<[string, string]> = [
  ['/api/workflows', 'workflow:manage'],
  ['/api/connectors', 'connector:manage'],
  ['/api/credentials', 'connector:manage'],
  ['/api/data-access', 'data-source:manage'],
  ['/api/agents', 'agent:manage'],
  ['/api/knowledge', 'knowledge:manage'],
  ['/api/ai', 'ai-provider:manage'],
  ['/api/prompts', 'prompt:manage'],
  ['/api/admin', 'settings:manage'],
]

export function checkSensitiveWrite(path: string, method: string, role: Role | null | undefined): boolean {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return true
  for (const [prefix, perm] of SENSITIVE_WRITES) {
    if (path.startsWith(prefix)) return can(role, perm)
  }
  return true
}

// 局部中间件：要求指定权限（用于对某个路由做更细的控制）
export function requirePerm(perm: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as Request & { auth?: { role?: Role } }).auth?.role
    if (!role) {
      res.status(401).json({ success: false, error: '请先登录' })
      return
    }
    if (!can(role, perm)) {
      res.status(403).json({ success: false, error: '权限不足' })
      return
    }
    next()
  }
}