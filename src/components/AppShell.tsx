import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import SideNav, { NAV_ITEMS } from '@/components/SideNav'
import TopBar from '@/components/TopBar'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  function closeMobile() { setMobileOpen(false) }

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* 桌面侧栏：≥md 显示 */}
      <div className="hidden md:flex">
        <SideNav />
      </div>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeMobile}
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                导航
              </div>
              <button
                type="button"
                onClick={closeMobile}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <SideNav variant="drawer" onNavigate={closeMobile} />
            </div>
            <div className={cn('border-t border-zinc-200 p-3 dark:border-zinc-800')}>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                <div className="font-semibold text-zinc-800 dark:text-zinc-100">当前角色</div>
                <div className="mt-1 capitalize">{user?.role ?? '未登录'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <div className="flex-1 p-3 sm:p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

// 标记给 SideNav 使用，避免 ts-prune 误删
export const __APP_SHELL_NAV = NAV_ITEMS


