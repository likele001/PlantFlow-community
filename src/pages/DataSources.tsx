import { useEffect, useState } from 'react'
import { apiRequest } from '@/utils/api'

type DataSource = {
  id: string
  tenantId: string
  name: string
  kind: 'mysql' | 'postgres' | 'http' | 'csv' | 'object_storage'
  config: Record<string, unknown>
  credentialId: string | null
  allowQuery: boolean
  fieldAllowlist: string[]
  status: 'draft' | 'testing' | 'active' | 'error'
  lastOkAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type Credential = { id: string; name: string; type: string }

const KIND_LABEL: Record<DataSource['kind'], string> = {
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  http: 'HTTP',
  csv: 'CSV / XLSX',
  object_storage: '对象存储',
}

const KIND_OPTIONS: DataSource['kind'][] = ['postgres', 'mysql', 'http', 'csv', 'object_storage']

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  testing: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  error: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

const EMPTY_CONFIG: Record<string, unknown> = {
  postgres: { host: '127.0.0.1', port: 5432, database: '', user: 'postgres' },
  mysql: { host: '127.0.0.1', port: 3306, database: '', user: 'root' },
  http: { method: 'GET', url: '', headers: '{}' },
  csv: { note: '保存后请上传 CSV / XLSX 文件' },
  object_storage: { endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', region: 'oss-cn-hangzhou', bucket: '', forcePathStyle: false },
}

function defaultConfig(kind: DataSource['kind']): Record<string, unknown> {
  return JSON.parse(JSON.stringify(EMPTY_CONFIG[kind] ?? {}))
}

export default function DataSources() {
  const token = localStorage.getItem('wf_auth') ? JSON.parse(localStorage.getItem('wf_auth')!).token : null
  const [sources, setSources] = useState<DataSource[]>([])
  const [creds, setCreds] = useState<Credential[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    kind: 'postgres' as DataSource['kind'],
    config: defaultConfig('postgres'),
    credentialId: '' as string,
    fieldAllowlist: '',
    allowQuery: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)

  // 查询控制台
  const [qSourceId, setQSourceId] = useState('')
  const [qSql, setQSql] = useState('SELECT * FROM users LIMIT 20')
  function changeQSource(id: string) {
    setQSourceId(id)
    const ds = sources.find((s) => s.id === id)
    if (!ds) return
    if (ds.kind === 'object_storage') setQSql('{"op":"list","prefix":""}')
    else if (ds.kind === 'csv') setQSql('SELECT * FROM data LIMIT 20')
    else if (ds.kind === 'postgres' || ds.kind === 'mysql') setQSql('SELECT * FROM users LIMIT 20')
    else setQSql('')
  }
  const [querying, setQuerying] = useState(false)
  const [qResult, setQResult] = useState<{ columns: string[]; rows: Record<string, unknown>[]; durationMs: number } | null>(null)
  const [qError, setQError] = useState('')

  useEffect(() => { void fetchAll() }, [])

  async function fetchAll() {
    await Promise.all([fetchSources(), fetchCreds()])
  }
  async function fetchSources() {
    const res = await apiRequest<DataSource[]>('/api/data-access/sources', { token })
    if (res.success) setSources(res.data ?? [])
  }
  async function fetchCreds() {
    const res = await apiRequest<Credential[]>('/api/credentials', { token })
    if (res.success) setCreds(res.data ?? [])
  }

  function resetForm() {
    setKeyFields(defaultConfig('postgres'))
    setForm({ name: '', kind: 'postgres', config: defaultConfig('postgres'), credentialId: '', fieldAllowlist: '', allowQuery: true })
    setEditId(null)
    setShowForm(false)
    setError('')
  }
  function setKeyFields(cfg: Record<string, unknown>) {
    setForm((f) => ({ ...f, config: cfg }))
  }
  function openCreate() {
    resetForm()
    setShowForm(true)
  }
  function openEdit(ds: DataSource) {
    setForm({
      name: ds.name,
      kind: ds.kind,
      config: JSON.parse(JSON.stringify(ds.config ?? {})),
      credentialId: ds.credentialId ?? '',
      fieldAllowlist: (ds.fieldAllowlist ?? []).join(', '),
      allowQuery: ds.allowQuery !== false,
    })
    setEditId(ds.id)
    setShowForm(true)
  }

  function setCfg(key: string, val: unknown) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: val } }))
  }
  // N4 第二批：csv 上传 + 预览状态
  const [uploading, setUploading] = useState(false)
  const [uploadInfo, setUploadInfo] = useState<{ columns: string[]; rowCount: number; filename: string; byteSize: number } | null>(null)
  const [samplePreview, setSamplePreview] = useState<{ columns: string[]; rowCount: number; preview: Record<string, unknown>[]; filename: string } | null>(null)
  const [queryHint, setQueryHint] = useState('')
  async function handleUpload(file: File) {
    if (!editId) { setError('请先保存数据源后再上传'); return }
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/data-access/sources/${editId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: fd,
      })
      const j = await r.json()
      if (!r.ok || !j.success) { setError(j.error ?? '上传失败'); return }
      setUploadInfo(j.data)
      await fetchSources()
      await fetchSample()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }
  async function fetchSample() {
    if (!editId) return
    const r = await fetch(`/api/data-access/sources/${editId}/sample`, { headers: { Authorization: `Bearer ${token ?? ''}` } })
    const j = await r.json()
    if (r.ok && j.success) setSamplePreview(j.data)
    else setSamplePreview(null)
  }
  useEffect(() => { if (editId) void fetchSample() }, [editId])

  function changeKind(kind: DataSource['kind']) {
    setForm((f) => ({ ...f, kind, config: defaultConfig(kind) }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('名称必填'); return }
    setLoading(true)
    setError('')
    const allowlist = form.fieldAllowlist.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    const body = {
      name: form.name.trim(),
      kind: form.kind,
      config: form.config,
      credentialId: form.credentialId || null,
      fieldAllowlist: allowlist,
      allowQuery: form.allowQuery,
    }
    try {
      const res = editId
        ? await apiRequest(`/api/data-access/sources/${editId}`, { method: 'PATCH', body, token })
        : await apiRequest('/api/data-access/sources', { method: 'POST', body, token })
      if (!res.success) { setError(res.error ?? '保存失败'); return }
      resetForm()
      await fetchSources()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(ds: DataSource) {
    if (!confirm(`确定删除数据源「${ds.name}」？`)) return
    const res = await apiRequest(`/api/data-access/sources/${ds.id}`, { method: 'DELETE', token })
    if (res.success) await fetchSources()
    else setError(res.error ?? '删除失败')
  }

  async function handleTest(ds: DataSource) {
    if (testingId) return
    setTestingId(ds.id)
    try {
      const res = await apiRequest(`/api/data-access/sources/${ds.id}/test`, { method: 'POST', body: {}, token })
      if (!res.success) setError(res.error ?? '测连失败')
      await fetchSources()
    } finally {
      setTestingId(null)
    }
  }

  async function handleQuery() {
    if (!qSourceId) { setQError('请选择数据源'); return }
    if (!qSql.trim()) { setQError('请输入查询语句'); return }
    setQError('')
    setQuerying(true)
    setQResult(null)
    try {
      const res = await apiRequest<{ columns: string[]; rows: Record<string, unknown>[]; durationMs: number }>(
        '/api/data-access/query',
        { method: 'POST', body: { sourceId: qSourceId, query: qSql }, token },
      )
      if (res.success) setQResult(res.data ?? null)
      else setQError(res.error ?? '查询失败')
    } finally {
      setQuerying(false)
    }
  }

  const cfg = form.config
  const isDb = form.kind === 'postgres' || form.kind === 'mysql'

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6 p-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">数据接入</h1>
          <p className="text-sm text-zinc-500">集中管理 MySQL / PostgreSQL / HTTP 数据源，统一查询入口、只读 + 字段白名单脱敏</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          新建数据源
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">{error}</div>
      ) : null}

      {showForm ? (
        <div className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editId ? '编辑数据源' : '新建数据源'}</h3>
            <button onClick={resetForm} className="text-sm text-zinc-400 hover:text-zinc-600">取消</button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              名称
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
            </label>
            <label className="block text-xs text-zinc-500">
              类型
              <select value={form.kind} onChange={(e) => changeKind(e.target.value as DataSource['kind'])}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
          </div>

          {isDb ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(['host', 'port', 'database'] as const).map((key) => (
                <label key={key} className="block text-xs text-zinc-500">
                  {key === 'host' ? '主机' : key === 'port' ? '端口' : '数据库'}
                  <input
                    value={String(cfg[key] ?? '')}
                    onChange={(e) => setCfg(key, key === 'port' ? Number(e.target.value) : e.target.value)}
                    placeholder={key === 'port' ? (form.kind === 'mysql' ? '3306' : '5432') : ''}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              ))}
              {form.kind === 'postgres' || form.kind === 'mysql' ? (
                <label className="block text-xs text-zinc-500">
                  用户名
                  <input value={String(cfg.user ?? '')} onChange={(e) => setCfg('user', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-500">
                方法
                <select value={String(cfg.method ?? 'GET')} onChange={(e) => setCfg('method', e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  {['GET', 'POST', 'PUT'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="block text-xs text-zinc-500">
                URL
                <input value={String(cfg.url ?? '')} onChange={(e) => setCfg('url', e.target.value)}
                  placeholder="https://api.example.com/data" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
              </label>
              <label className="block text-xs text-zinc-500 sm:col-span-2">
                Headers（JSON，支持 {'{{credential.token}}'} 占位）
                <textarea value={String(cfg.headers ?? '{}')} onChange={(e) => setCfg('headers', e.target.value)} rows={3}
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
              </label>
            </div>
          )}

          <label className="block text-xs text-zinc-500">
            关联凭证（存放密码 / API Key，加密存储）
            <select value={form.credentialId} onChange={(e) => setForm({ ...form, credentialId: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">不关联（使用 config 内明文 user）</option>
              {creds.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.type}）</option>)}
            </select>
          </label>

          <label className="block text-xs text-zinc-500">
            字段白名单（仅暴露这些字段，逗号分隔；留空则自动剔除敏感列）
            <input value={form.fieldAllowlist} onChange={(e) => setForm({ ...form, fieldAllowlist: e.target.value })}
              placeholder="id, name, price" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={form.allowQuery} onChange={(e) => setForm({ ...form, allowQuery: e.target.checked })} />
            允许查询（只读，仅 SELECT / WITH）
          </label>

          <div className="flex gap-2">
            {form.kind === 'csv' && editId ? (
              <div className='mt-3 space-y-2 rounded-lg border border-dashed p-3 dark:border-zinc-700'>
                <div className='flex items-center justify-between'>
                  <div className='text-xs font-semibold text-zinc-500'>表格文件（CSV / XLSX / TXT，单文件 ≤2MB）</div>
                  {samplePreview ? (
                    <span className='text-[10px] text-emerald-600'>
                      {samplePreview.filename} · {samplePreview.rowCount} 行 × {samplePreview.columns.length} 列
                    </span>
                  ) : null}
                </div>
                <input
                  type='file'
                  accept='.csv,.txt,.xlsx,.xls'
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleUpload(f)
                  }}
                  className='block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900'
                />
                {uploadInfo ? (
                  <div className='text-[10px] text-zinc-500'>
                    ✓ 已上传 {uploadInfo.filename}（{uploadInfo.byteSize} 字节）
                  </div>
                ) : null}
                {samplePreview ? (
                  <div className='overflow-x-auto rounded border bg-zinc-50 p-2 text-[10px] dark:bg-zinc-900'>
                    <div className='mb-1 text-zinc-500'>列：{samplePreview.columns.join(', ')}</div>
                    <table className='w-full text-left'>
                      <thead><tr>{samplePreview.columns.map((c) => <th key={c} className='pr-2'>{c}</th>)}</tr></thead>
                      <tbody>{samplePreview.preview.map((r, i) => (
                        <tr key={i}>{samplePreview.columns.map((c) => <td key={c} className='pr-2'>{String(r[c] ?? '')}</td>)}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {form.kind === 'object_storage' ? (
              <div className='mt-3 space-y-2 rounded-lg border border-dashed p-3 dark:border-zinc-700'>
                <div className='text-xs font-semibold text-zinc-500'>对象存储配置（S3 兼容：阿里云 OSS / 腾讯云 COS / AWS S3 / MinIO）</div>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                  <label className='block text-xs text-zinc-500'>Endpoint
                    <input value={String(form.config.endpoint ?? '')} onChange={(e) => setCfg('endpoint', e.target.value)} className='mt-1 w-full rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900' />
                  </label>
                  <label className='block text-xs text-zinc-500'>Region
                    <input value={String(form.config.region ?? '')} onChange={(e) => setCfg('region', e.target.value)} className='mt-1 w-full rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900' />
                  </label>
                  <label className='block text-xs text-zinc-500'>Bucket
                    <input value={String(form.config.bucket ?? '')} onChange={(e) => setCfg('bucket', e.target.value)} className='mt-1 w-full rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900' />
                  </label>
                  <label className='block text-xs text-zinc-500'>Force Path Style
                    <select value={String(form.config.forcePathStyle ?? false)} onChange={(e) => setCfg('forcePathStyle', e.target.value === 'true')} className='mt-1 w-full rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900'>
                      <option value='false'>否（virtual-host）</option>
                      <option value='true'>是（path-style，MinIO 常用）</option>
                    </select>
                  </label>
                </div>
                <div className='text-[10px] text-zinc-500'>凭据请在「凭证」页创建一个类型为 api_key 的 credential，data 字段填 <code>accessKeyId</code> / <code>secretAccessKey</code>，然后在「凭证」下拉中绑定。</div>
              </div>
            ) : null}

                        <button onClick={handleSave} disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {loading ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {sources.map((ds) => (
          <div key={ds.id} className="flex items-center justify-between rounded-xl border p-4 dark:border-zinc-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{ds.name}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{KIND_LABEL[ds.kind]}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[ds.status] ?? ''}`}>{ds.status}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                白名单: {(ds.fieldAllowlist ?? []).length ? ds.fieldAllowlist.join(', ') : '自动脱敏'}
              </div>
              {ds.lastError ? (
                <div className="mt-1 text-xs text-red-600">{String(ds.lastError).slice(0, 120)}</div>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => { setQSourceId(ds.id); setQResult(null) }}
                className="rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700">查询</button>
              <button onClick={() => handleTest(ds)} disabled={!!testingId}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700">
                {testingId === ds.id ? '测试中…' : '测连'}
              </button>
              {ds.kind === 'csv' ? (
                <button onClick={() => openEdit(ds)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700">上传表格</button>
              ) : null}
              <button onClick={() => openEdit(ds)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700">编辑</button>
              <button onClick={() => handleDelete(ds)} className="rounded-lg border px-3 py-1.5 text-sm text-red-600 dark:border-zinc-700">删除</button>
            </div>
          </div>
        ))}
        {sources.length === 0 && !showForm ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zinc-400">暂无数据源，点击右上角新建</div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
        <h3 className="font-semibold">查询控制台</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-zinc-500">
            数据源
            <select value={qSourceId} onChange={(e) => changeQSource(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <option value="">选择数据源</option>
              {sources.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-500 sm:col-span-2">
            SQL（仅 SELECT / WITH，强制 LIMIT）
            <textarea value={qSql} onChange={(e) => setQSql(e.target.value)} rows={3}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleQuery} disabled={querying}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {querying ? '查询中…' : '运行'}
          </button>
          {qResult ? <span className="text-xs text-zinc-500">{qResult.rows.length} 行 / {qResult.durationMs}ms</span> : null}
        </div>
        {qError ? <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/30">{qError}</div> : null}
        {qResult ? (
          <div className="overflow-auto rounded-lg border dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-900">
                  {(qResult.columns ?? []).map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {(qResult.rows ?? []).slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t dark:border-zinc-800">
                    {(qResult.columns ?? []).map((c) => <td key={c} className="px-3 py-2">{String(r[c] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}