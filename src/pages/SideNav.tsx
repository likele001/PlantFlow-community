import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import {
  Activity, Bell, Blocks, BookOpen, Bot, CalendarClock, Database, FileText, FlaskConical, Inbox,
  KeyRound, LayoutDashboard, LayoutGrid, MessageCircleMore, Sparkles, Users, Workflow, Gauge, Wallet,
} from 'lucide-react'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
  perm?: string
  platformOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: '控制台', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/workflows', label: '工作流', icon: <Workflow className="h-4 w-4" /> },
  { to: '/executions', label: '执行中心', icon: <Activity className="h-4 w-4" /> },
  { to: '/alerts', label: '告警中心', icon: <Bell className="h-4 w-4" /> },
  { to: '/cron', label: '定时任务', icon: <CalendarClock className="h-4 w-4" />, perm: 'workflow:view' },
  { to: '/inbox', label: '会话中心', icon: <Inbox className="h-4 w-4" /> },
  { to: '/channels', label: '渠道接入', icon: <MessageCircleMore className="h-4 w-4" />, perm: 'workflow:manage' },
  { to: '/connectors', label: '连接器', icon: <Blocks className="h-4 w-4" />, perm: 'connector:view' },
  { to: '/credentials', label: '凭证管理', icon: <KeyRound className="h-4 w-4" />, perm: 'connector:manage' },
  { to: '/data-sources', label: '数据接入', icon: <Database className="h-4 w-4" />, perm: 'data-source:view' },
  { to: '/agent-debug', label: 'Agent 调试', icon: <FlaskConical className="h-4 w-4" />, perm: 'agent:manage' },
  { to: '/scenarios', label: '场景模板', icon: <LayoutGrid className="h-4 w-4" />, perm: 'workflow:manage' },
  { to: '/ai/models', label: 'AI 模型', icon: <Sparkles className="h-4 w-4" />, perm: 'ai-provider:view' },
  { to: '/ai/prompts', label: 'Prompt 模板', icon: <FileText className="h-4 w-4" />, perm: 'prompt:view' },
  { to: '/ai/apps', label: '对话应用', icon: <Bot className="h-4 w-4" />, perm: 'workflow:manage' },
  { to: '/bot', label: '助手配置', icon: <Bot className="h-4 w-4" />, perm: 'workflow:manage' },
  { to: '/ai/knowledge', label: '知识库', icon: <BookOpen className="h-4 w-4" />, perm: 'knowledge:view' },
  { to: '/observability', label: '可观测性', icon: <Activity className="h-4 w-4" />, perm: 'settings:manage' },
  { to: '/metrics', label: '运营计量', icon: <Gauge className="h-4 w-4" />, platformOnly: true, perm: 'settings:manage' },
  { to: '/billing', label: '计费与套餐', icon: <Wallet className="h-4 w-4" /> },
  { to: '/admin', label: '成员与审计', icon: <Users className="h-4 w-4" />, perm: 'settings:manage' },
  { to: '/docs', label: '帮助文档', icon: <BookOpen className="h-4 w-4" /> },
]

export default function SideNav(props?: { variant?: 'sidebar' | 'drawer'; onNavigate?: () => void }) {
  const variant = props?.variant ?? 'sidebar'
  const onNavigate = props?.onNavigate
  const location = useLocation()
  const permissions = useAuthStore((s) => s.permissions)
  const user = useAuthStore((s) => s.user)

  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin'

  const visible = NAV_ITEMS.filter((it) => {
    if (it.platformOnly && user?.role !== 'platform_admin') return false
    if (isAdmin || !it.perm) return true
    return permissions.includes('*') || permissions.includes(it.perm)
  })

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col',
        variant === 'sidebar' && 'border-r border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950',
        variant === 'drawer' && 'bg-white dark:bg-zinc-950',
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        {visible.map((it) => {
          const active = location.pathname === it.to || (it.to !== '/dashboard' && location.pathname.startsWith(it.to + '/'))
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                active
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60',
              )}
            >
              <span className={cn(active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400')}>
                {it.icon}
              </span>
              <span className="truncate">{it.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}