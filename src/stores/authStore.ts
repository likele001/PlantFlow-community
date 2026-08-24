import { create } from 'zustand'
import { apiRequest } from '@/utils/api'

type AuthUser = {
  id: string
  email: string
  role: string
}

type AuthTenant = {
  id: string
  name: string
  role?: string
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  tenant: AuthTenant | null
  tenants: AuthTenant[]
  permissions: string[]
  error: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  hydrate: () => void
  refreshMe: () => Promise<void>
  setAuth: (token: string, user: AuthUser, tenant: AuthTenant | null, tenants?: AuthTenant[]) => void
  switchTenant: (tenantId: string) => Promise<boolean>
  can: (perm: string) => boolean
}

type LoginResponse = {
  token: string
  user: AuthUser
  tenant: AuthTenant | null
  tenants?: AuthTenant[]
}

type PersistedState = Pick<AuthState, 'token' | 'user' | 'tenant' | 'tenants' | 'permissions'>

function readPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem('wf_auth')
    if (!raw) return { token: null, user: null, tenant: null, tenants: [], permissions: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      token: typeof parsed.token === 'string' ? parsed.token : null,
      user: parsed.user ?? null,
      tenant: parsed.tenant ?? null,
      tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    }
  } catch {
    return { token: null, user: null, tenant: null, tenants: [], permissions: [] }
  }
}

function persist(s: PersistedState) {
  try {
    localStorage.setItem('wf_auth', JSON.stringify(s))
  } catch {}
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  tenant: null,
  tenants: [],
  permissions: [],
  error: null,
  isLoading: false,
  hydrate: () => {
    const p = readPersisted()
    set({ ...p })
    if (p.token) void get().refreshMe()
  },
  refreshMe: async () => {
    const token = get().token
    if (!token) return
    const res = await apiRequest<{
      user: AuthUser
      tenantId: string
      permissions: string[]
    }>('/api/auth/me', { token })
    if (!('data' in res)) return
    const user = res.data.user
    const next = { token, user, tenant: get().tenant, tenants: get().tenants, permissions: res.data.permissions ?? [] }
    persist(next)
    set(next)
  },
  login: async (email, password) => {
    set({ isLoading: true, error: null })
    const res = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (!('data' in res)) {
      set({ isLoading: false, error: res.error })
      return false
    }

    const next = {
      token: res.data.token,
      user: res.data.user,
      tenant: res.data.tenant,
      tenants: res.data.tenants ?? [],
      permissions: [],
    }
    persist(next)
    set({ ...next, isLoading: false, error: null })
    // fetch detailed permissions after login
    await get().refreshMe()
    return true
  },
  logout: async () => {
    const token = get().token
    set({ isLoading: true, error: null })
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => null)
    }
    persist({ token: null, user: null, tenant: null, tenants: [], permissions: [] })
    set({ token: null, user: null, tenant: null, tenants: [], permissions: [], isLoading: false })
  },
  setAuth: (token, user, tenant, tenants = []) => {
    persist({ token, user, tenant, tenants, permissions: [] })
    set({ token, user, tenant, tenants, permissions: [], isLoading: false, error: null })
  },
  switchTenant: async (tenantId) => {
    const token = get().token
    if (!token) return false
    set({ isLoading: true, error: null })
    const res = await apiRequest<LoginResponse>('/api/auth/switch-tenant', {
      method: 'POST',
      token,
      body: { tenantId },
    })
    if (!('data' in res)) {
      set({ isLoading: false, error: res.error })
      return false
    }
    const next = {
      token: res.data.token,
      user: res.data.user,
      tenant: res.data.tenant,
      tenants: res.data.tenants ?? get().tenants,
      permissions: [],
    }
    persist(next)
    set({ ...next, isLoading: false, error: null })
    await get().refreshMe()
    return true
  },
  can: (perm) => {
    const perms = get().permissions
    return perms.includes('*') || perms.includes(perm)
  },
}))