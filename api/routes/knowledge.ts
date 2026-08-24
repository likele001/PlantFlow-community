import { Router, type Response } from 'express'
import { db } from '../store.js'
import { pool } from '../db.js'
import { createEmbedding } from '../engine/llm.js'
import type { AuthedRequest } from '../middleware/auth.js'
import multer from 'multer'
import fs from 'node:fs'

const router = Router()

// F5: 文件类型白名单 + 大小限制
const ALLOWED_EXT = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'md', 'markdown', 'txt', 'json', 'yml', 'yaml'])
const ALLOWED_EXT_LIST = [...ALLOWED_EXT].join(', ')
// F5: 全局解析文本长度上限（避免超大文档拖垮分片/向量化）
const MAX_PARSE_CHARS = 500_000

function hasAllowedExt(name: string): boolean {
  const ext = String(name).toLowerCase().split('.').pop() ?? ''
  return ALLOWED_EXT.has(ext)
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!hasAllowedExt(file.originalname)) {
      cb(new Error(`不支持的文件类型，仅支持: ${ALLOWED_EXT_LIST}`))
      return
    }
    cb(null, true)
  },
})

async function embedDocumentChunks(tenantId: string, documentId: string) {
  const chunks = await db.listChunksWithoutEmbedding(tenantId, documentId)
  for (const ch of chunks) {
    const vec = await createEmbedding(tenantId, ch.content)
    await db.setChunkEmbedding(ch.id, vec)
  }
}

async function parseFile(file: Express.Multer.File): Promise<string> {
  const ext = (file.originalname.toLowerCase().split('.').pop() ?? '').replace(/[^a-z0-9]/g, '')
  if (ext === 'pdf') {
    try {
      const mod = await import('pdf-parse')
      const PDFParse = (mod as { default?: unknown }).default ?? (mod as unknown)
      const data = await (PDFParse as unknown as (buf: Buffer) => Promise<{ text: string }>)(file.buffer)
      return String(data.text ?? '')
    } catch (e) {
      throw new Error('PDF 解析失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: file.buffer })
      return String(result.value ?? '')
    } catch (e) {
      throw new Error('DOCX 解析失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(file.buffer, { type: 'buffer' })
      const parts: string[] = []
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`)
        if (parts.join('\n').length > 200_000) break
      }
      return parts.join('\n\n')
    } catch (e) {
      throw new Error('Excel 解析失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  if (ext === 'csv') {
    const raw = file.buffer.toString('utf-8')
    // Pass through with row count cap to avoid huge outputs
    const rows = raw.split(/\r?\n/)
    return rows.slice(0, 5000).join('\n')
  }
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    return file.buffer.toString('utf-8')
  }
  return file.buffer.toString('utf-8')
}

router.get('/bases', async (req: AuthedRequest, res: Response) => {
  const list = await db.listKnowledgeBases(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/bases', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as { name?: string; description?: string; chunkStrategy?: string; chunkSize?: number; chunkOverlap?: number; separator?: string }
  const n = String(body.name ?? '').trim()
  if (!n) {
    res.status(400).json({ success: false, error: '名称必填' })
    return
  }
  const kb = await db.createKnowledgeBase(tenantId, n, body.description?.trim(), body.chunkStrategy, body.chunkSize, body.chunkOverlap, body.separator)
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'knowledge.create',
    resourceType: 'knowledge_base',
    resourceId: kb.id,
  })
  res.status(201).json({ success: true, data: kb })
})

router.patch('/bases/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as { name?: string; description?: string; chunkStrategy?: string; chunkSize?: number; chunkOverlap?: number; separator?: string }
  const kb = await db.updateKnowledgeBase(tenantId, req.params.id, body)
  if (!kb) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: kb })
})

router.delete('/bases/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const ok = await db.deleteKnowledgeBase(tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.get('/bases/:id/documents', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const kb = await db.findKnowledgeBase(tenantId, req.params.id)
  if (!kb) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const docs = await db.listKnowledgeDocuments(tenantId, req.params.id)
  res.json({ success: true, data: docs })
})

router.post('/bases/:id/documents', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const kbaseId = req.params.id
  const kb = await db.findKnowledgeBase(tenantId, kbaseId)
  if (!kb) {
    res.status(404).json({ success: false, error: '知识库不存在' })
    return
  }
  const { title, content } = (req.body ?? {}) as { title?: string; content?: string }
  const t = String(title ?? '').trim()
  const c = String(content ?? '').trim()
  if (!t || !c) {
    res.status(400).json({ success: false, error: '标题与内容必填' })
    return
  }
  const doc = await db.addKnowledgeDocument(tenantId, kbaseId, t, c)
  void embedDocumentChunks(tenantId, doc.id).catch((e) =>
    console.error('[knowledge] embed failed', e),
  )
  res.status(201).json({ success: true, data: doc })
})

router.post('/bases/:id/upload', uploadReq, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.auth!.tenantId
    const kbaseId = req.params.id
    const kb = await db.findKnowledgeBase(tenantId, kbaseId)
    if (!kb) {
      res.status(404).json({ success: false, error: '知识库不存在' })
      return
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file
    if (!file) {
      res.status(400).json({ success: false, error: '未上传文件' })
      return
    }
    const title = file.originalname
    const text = capParseLength(await parseFile(file))
    if (!text?.trim()) {
      res.status(400).json({ success: false, error: '文件内容为空或无法解析' })
      return
    }

    const doc = await db.addKnowledgeDocument(tenantId, kbaseId, title, text, 'file')
    void embedDocumentChunks(tenantId, doc.id).catch((e) =>
      console.error('[knowledge] embed failed', e),
    )
    res.status(201).json({ success: true, data: doc })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '文件解析失败' })
  }
})

router.post('/bases/:id/search', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { query, limit, mode } = (req.body ?? {}) as { query?: string; limit?: number; mode?: string }
  const q = String(query ?? '').trim()
  if (!q) {
    res.status(400).json({ success: false, error: '查询词必填' })
    return
  }
  const lim = limit ?? 5

  if (mode === 'vector') {
    const vectorized = await db.countVectorizedChunks(tenantId, req.params.id)
    if (vectorized === 0) {
      res.json({
        success: true,
        data: [],
        mode: 'vector',
        warning:
          '文档尚未向量化。请先在「AI 模型」配置 Embedding 模型，再对文档点「重向量化」。临时可用「关键词」或「混合」检索。',
      })
      return
    }
    try {
      const hits = await db.searchKnowledgeChunksVector(tenantId, req.params.id, q, lim)
      res.json({ success: true, data: hits, mode: 'vector' })
    } catch (e) {
      res.json({
        success: true,
        data: [],
        mode: 'vector',
        warning: e instanceof Error ? e.message : '向量检索失败',
      })
    }
    return
  }

  if (mode === 'hybrid') {
    try {
      const hits = await db.searchKnowledgeChunksHybrid(tenantId, req.params.id, q, lim)
      res.json({ success: true, data: hits, mode: 'hybrid' })
    } catch (e) {
      res.json({
        success: true,
        data: [],
        mode: 'hybrid',
        warning: e instanceof Error ? e.message : '混合检索失败，请尝试关键词检索',
      })
    }
    return
  }

  const hits = await db.searchKnowledgeChunks(tenantId, req.params.id, q, lim)
  res.json({ success: true, data: hits, mode: 'keyword' })
})

router.delete('/documents/:docId', async (req: AuthedRequest, res: Response) => {
  const ok = await db.deleteKnowledgeDocument(req.auth!.tenantId, req.params.docId)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.post('/documents/:docId/reindex', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  void embedDocumentChunks(tenantId, req.params.docId).catch((e) =>
    console.error('[knowledge] reindex failed', e),
  )
  res.json({ success: true, message: '已向量化任务已启动' })
})

// === O3: 新增端点 — 列出文档的所有分片用于来源回显 ===
router.get('/documents/:docId/chunks', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const docId = req.params.docId
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200)
  const offset = Math.max(Number(req.query.offset ?? 0), 0)
  const { rows: docRows } = await pool.query(
    `SELECT id, title, source_type FROM knowledge_documents WHERE id = $1 AND tenant_id = $2`,
    [docId, tenantId],
  )
  if (!docRows[0]) { res.status(404).json({ success: false, error: '文档不存在' }); return }
  const { rows } = await pool.query(
    `SELECT id, idx, content, char_length(content) AS length,
            (embedding_json IS NOT NULL) AS vectorized
       FROM knowledge_chunks
      WHERE document_id = $1 AND tenant_id = $2
      ORDER BY idx ASC
      LIMIT $3 OFFSET $4`,
    [docId, tenantId, limit, offset],
  )
  const chunks = rows.map((r: { id: string; idx: number; content: string; length: number; vectorized: boolean }) => ({
    id: r.id,
    idx: r.idx,
    content: String(r.content ?? ''),
    length: Number(r.length ?? 0),
    preview: String(r.content ?? '').slice(0, 200) + (String(r.content ?? '').length > 200 ? '…' : ''),
    vectorized: !!r.vectorized,
  }))
  const { rows: cnt } = await pool.query(
    `SELECT count(*)::int AS total FROM knowledge_chunks WHERE document_id = $1 AND tenant_id = $2`,
    [docId, tenantId],
  )
  res.json({
    success: true,
    data: {
      document: docRows[0],
      chunks,
      total: Number(cnt[0]?.total ?? chunks.length),
      limit,
      offset,
    },
  })
})

router.get('/chunks/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { rows } = await pool.query(
    `SELECT c.id, c.idx, c.content, c.document_id, d.title, d.source_type,
            (c.embedding IS NOT NULL) AS vectorized
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.id = $1 AND c.tenant_id = $2`,
    [req.params.id, tenantId],
  )
  if (!rows[0]) { res.status(404).json({ success: false, error: '分片不存在' }); return }
  const r = rows[0]
  res.json({
    success: true,
    data: {
      id: r.id,
      idx: r.idx,
      content: r.content,
      documentId: r.document_id,
      documentTitle: r.title,
      sourceType: r.source_type,
      vectorized: !!r.vectorized,
    },
  })
})

// F5: 包装 multer，将类型/大小校验错误转为 400 JSON（而非 500 / 默认 HTML）
function uploadReq(req: import('express').Request, res: import('express').Response, next: () => void) {
  upload.single('file')(req, res, (err?: unknown) => {
    if (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : '文件上传失败' })
      return
    }
    next()
  })
}

// F5: 限制解析文本长度，超过上限直接截断
function capParseLength(text: string): string {
  return text.length > MAX_PARSE_CHARS ? text.slice(0, MAX_PARSE_CHARS) : text
}

export default router
