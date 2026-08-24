import { useEffect, useState } from 'react'
import { Copy, Lock, Save, Trash2, User, UserPlus } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

export default function Profile() {
  const { user, tenant, token, logout } = useAuthStore()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function changePassword() {
    setMsg(null)
    if (!currentPwd || !newPwd) {
      setMsg({ type: 'error', text: '请填写完整' })
      return
    }
    if (newPwd.length < 6) {
      setMsg({ type: 'error', text: '新密码至少 6 位' })
      return
    }
    if (newPwd !== confirmPwd) {
      setMsg({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    setSaving(true)
    const res = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: currentPwd, newPassword: newPwd },
    })
    setSaving(false)
    if ('data' in res && res.success) {
      setMsg({ type: 'success', text: '密码已修改，3 秒后跳转到登录...' })
      setTimeout(() => { void logout() }, 3000)
    } else {
      setMsg({ type: 'error', text: ('error' in res ? res.error : '') || '修改失败' })
    }
  }

  // ===== 邀请员工（仅企业管理员）=====
  const isAdmin = user?.role === 'tenant_admin'
  const [invites, setInvites] = useState<{ id: string; email: string | null; role: string; expiresAt: string; usedAt: string | null }[]>([])
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState<'developer' | 'operator' | 'agent'>('developer')
  const [inviteLink, setInviteLink] = useState('')
  const [invMsg, setInvMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [invLoading, setInvLoading] = useState(false)

  async function loadInvites() {
    const res = await apiRequest<{ id: string; email: string | null; role: string; expiresAt: string; usedAt: string | null }[]>('/api/tenants/invites', { token })
    if ('data' in res) setInvites(res.data)
  }

  async function createInvite() {
    setInvMsg(null)
    setInvLoading(true)
    const res = await apiRequest<{ inviteUrl: string }>('/api/tenants/invites', {
      method: 'POST',
      token,
      body: { email: invEmail || undefined, role: invRole },
    })
    setInvLoading(false)
    if ('data' in res && res.data) {
      setInviteLink(res.data.inviteUrl)
      setInvEmail('')
      setInvMsg({ type: 'success', text: '邀请链接已生成，复制发送给员工' })
      void loadInvites()
    } else {
      setInvMsg({ type: 'error', text: ('error' in res ? res.error : '') || '生成失败' })
    }
  }

  async function revokeInvite(id: string) {
    await apiRequest(`/api/tenants/invites/${id}`, { method: 'DELETE', token })
    void loadInvites()
  }

  async function copyInvite() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setInvMsg({ type: 'success', text: '已复制到剪贴板' })
    } catch {
      setInvMsg({ type: 'error', text: inviteLink })
    }
  }

  useEffect(() => { if (isAdmin) void loadInvites() }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-violet-500" />
        <h1 className="text-xl font-bold">账号设置</h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold">基本信息</div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-500">邮箱</div>
            <div className="mt-1 font-medium">{user?.email}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">角色</div>
            <div className="mt-1 font-medium">
              {user?.role === 'tenant_admin' ? '租户管理员' : user?.role === 'platform_admin' ? '平台管理员' : user?.role ?? '-'}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-zinc-500">租户</div>
            <div className="mt-1 font-medium">{tenant?.name ?? '-'}</div>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-violet-500" />
            邀请员工
          </div>
          <div className="mt-1 text-xs text-zinc-500">生成邀请链接，员工通过链接注册后将加入当前企业。无邀请码不可注册。</div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <div className="mb-1 text-xs text-zinc-500">员工邮箱（可选，留空则不限定）</div>
              <input
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs text-zinc-500">角色</div>
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value as any)}
                className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="developer">开发者</option>
                <option value="operator">运营</option>
                <option value="agent">坐席</option>
              </select>
            </label>
            <button
              onClick={createInvite}
              disabled={invLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {invLoading ? '生成中...' : '生成邀请链接'}
            </button>
          </div>

          {invMsg ? (
            <div className={`mt-3 rounded-xl border px-4 py-3 text-xs ${invMsg.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
              {invMsg.text}
            </div>
          ) : null}

          {inviteLink ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
              <input readOnly value={inviteLink} className="min-w-0 flex-1 bg-transparent text-xs text-zinc-600 outline-none dark:text-zinc-400" />
              <button onClick={copyInvite} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                <Copy className="h-3 w-3" /> 复制
              </button>
            </div>
          ) : null}

          {invites.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-zinc-500">已发出的邀请</div>
              <div className="space-y-2">
                {invites.map((it) => (
                  <div key={it.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
                    <div>
                      <div className="font-medium">{it.email ?? '不限邮箱'}</div>
                      <div className="text-zinc-500">
                        {it.role === 'developer' ? '开发者' : it.role === 'operator' ? '运营' : '坐席'}
                        {' · '}{it.usedAt ? '已使用' : new Date(it.expiresAt) < new Date() ? '已过期' : '待使用'}
                      </div>
                    </div>
                    {!it.usedAt ? (
                      <button onClick={() => void revokeInvite(it.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
                        <Trash2 className="h-3 w-3" /> 撤销
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" />
          修改密码
        </div>
        <div className="mt-1 text-xs text-zinc-500">修改成功后将自动登出，需用新密码重新登录</div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">当前密码</div>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="请输入当前密码"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">新密码（至少 6 位）</div>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="新密码"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">确认新密码</div>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="再次输入新密码"
            />
          </label>

          {msg ? (
            <div className={`rounded-xl border px-4 py-3 text-xs ${msg.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
              {msg.text}
            </div>
          ) : null}

          <button
            onClick={changePassword}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Save className="h-4 w-4" />
            {saving ? '修改中...' : '保存新密码'}
          </button>
        </div>
      </div>
    </div>
  )
}