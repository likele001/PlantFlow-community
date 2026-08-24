import { useState } from 'react'
import { BookOpen, ChevronRight, Search } from 'lucide-react'

type DocSection = {
  id: string
  title: string
  icon: string
  children: { id: string; title: string; content: React.ReactNode }[]
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0 mb-4">{children}</h2>
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mt-6 mb-2">{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">{children}</p>
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-zinc-100 dark:bg-zinc-800 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
}
function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-x-auto text-sm font-mono my-3 leading-relaxed">
      {children}
    </pre>
  )
}
function Note({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warning' | 'tip' }) {
  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300',
    tip: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300',
  }
  const labels = { info: '提示', warning: '注意', tip: '技巧' }
  return (
    <div className={`border-l-4 rounded-r-lg p-3 my-3 text-sm ${colors[type]}`}>
      <strong>{labels[type]}：</strong>{children}
    </div>
  )
}
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-100 dark:bg-zinc-800">
            {headers.map((h, i) => (
              <th key={i} className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              {row.map((cell, j) => (
                <td key={j} className="border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-zinc-600 dark:text-zinc-400">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const sections: DocSection[] = [
  {
    id: 'quickstart',
    title: '快速开始',
    icon: '🚀',
    children: [
      {
        id: 'overview',
        title: '平台概览',
        content: (
          <>
            <H2>平台概览</H2>
            <P>PlantFlow（厂流）是一个开源的可视化工作流编排 + AI 知识库 + 对话应用平台。它将 n8n（流程编排）和 Dify（AI 应用）的能力整合到一个系统中，面向工厂、企业与商家提供自动化解决方案。</P>
            <H3>核心能力</H3>
            <Table
              headers={['模块', '功能', '说明']}
              rows={[
                ['工作流', '可视化编排', '拖拽式流程设计，30+ 节点类型（触发/逻辑/AI/集成）'],
                ['连接器', '外部系统连接', 'HTTP、数据库等连接配置，供工作流节点直接引用'],
                ['凭证管理', '密钥安全存储', 'API Key / OAuth 凭证统一管理，加密存储'],
                ['数据接入', '多源数据导入', '表格文件（CSV/XLSX）+ 对象存储（S3 兼容：阿里云 OSS/腾讯云 COS/AWS S3/MinIO）'],
                ['AI 模型', '大模型接入', '支持 OpenAI、DeepSeek、通义千问、MiniMax、Ollama 等'],
                ['知识库', 'RAG 检索增强', '文档自动分段，关键词 + 向量混合检索'],
                ['AI Agent', '自主决策代理', '按可用工具自动生成 Agent 配置，支持调试（N3 Beta）'],
                ['对话应用', 'AI 客服发布', '一键发布为聊天机器人，提供 OpenAI 兼容 API'],
                ['渠道接入', '多渠道消息', '企业微信、飞书、钉钉、Webhook、淘宝等集成'],
                ['执行监控', '运行可视化', '执行中心、可观测性、指标监控、失败告警、定时任务'],
              ]}
            />
            <H3>技术架构</H3>
            <P>前端采用 React + TypeScript + Tailwind CSS，后端基于 Node.js + Express + PostgreSQL（pgvector 向量检索）。支持 Docker Compose 一键部署，MIT 开源协议。</P>
          </>
        ),
      },
      {
        id: 'install',
        title: '安装部署',
        content: (
          <>
            <H2>安装部署</H2>
            <H3>Docker Compose 部署（推荐）</H3>
            <P>最快 5 分钟完成部署，适合生产环境：</P>
            <CodeBlock>{`# 1. 克隆仓库
git clone https://github.com/likele001/PlantFlow.git
cd PlantFlow

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写数据库密码等配置

# 3. 启动服务
docker compose up -d

# 4. 访问 http://localhost:5000`}</CodeBlock>
            <Note type="tip">默认账号：admin@example.com / admin123，登录后请立即修改密码。</Note>
            <H3>手动部署</H3>
            <P>适合开发环境或自定义部署场景：</P>
            <CodeBlock>{`# 1. 安装依赖
npm install

# 2. 初始化数据库
npm run db:migrate

# 3. 启动开发服务器
npm run dev

# 4. 生产构建
npm run build
npm start`}</CodeBlock>
            <H3>系统要求</H3>
            <Table
              headers={['组件', '最低要求', '推荐配置']}
              rows={[
                ['CPU', '1 核', '2 核+'],
                ['内存', '1 GB', '2 GB+'],
                ['磁盘', '5 GB', '20 GB+'],
                ['Node.js', '18+', '20+ LTS'],
                ['PostgreSQL', '14+（含 pgvector）', '15+'],
              ]}
            />
            <Note type="info">向量检索需要 PostgreSQL 的 pgvector 扩展；仅使用关键词检索则无需安装。</Note>
          </>
        ),
      },
      {
        id: 'first-workflow',
        title: '第一个工作流',
        content: (
          <>
            <H2>创建第一个工作流</H2>
            <P>工作流是 PlantFlow 的核心。一个工作流由多个节点组成，节点之间通过连线定义执行顺序。</P>
            <H3>步骤</H3>
            <P><strong>1. 进入工作流页面</strong> — 点击左侧导航「工作流」，点击右上角「新建工作流」。</P>
            <P><strong>2. 添加触发器</strong> — 拖入一个「手动触发」节点作为起点。</P>
            <P><strong>3. 添加处理节点</strong> — 拖入「HTTP 请求」节点，配置目标 URL 和方法。</P>
            <P><strong>4. 连接节点</strong> — 从触发器的输出端口拖线到 HTTP 请求的输入端口。</P>
            <P><strong>5. 保存并测试</strong> — 点击右上角「运行」按钮，在「执行中心」查看执行结果。</P>
            <Note type="tip">还可以用「AI 辅助搭建」：描述你的需求，AI 自动生成整个工作流，再手动微调。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'workflow',
    title: '工作流编排',
    icon: '⚙️',
    children: [
      {
        id: 'nodes',
        title: '节点类型',
        content: (
          <>
            <H2>节点类型</H2>
            <P>PlantFlow 提供 30+ 种节点类型，覆盖触发、逻辑、AI、集成四大类。</P>
            <H3>触发器节点</H3>
            <Table
              headers={['节点', '说明', '使用场景']}
              rows={[
                ['手动触发', '点击按钮执行', '测试、临时任务'],
                ['定时触发', 'Cron 表达式定时', '日报、定时同步'],
                ['Webhook', 'HTTP 回调触发', '外部系统事件驱动'],
                ['对话触发', '用户发消息触发', 'AI 客服、聊天机器人'],
                ['企微/飞书/钉钉', 'IM 平台消息触发', '企业内部自动化'],
              ]}
            />
            <H3>逻辑节点</H3>
            <Table
              headers={['节点', '说明']}
              rows={[
                ['IF 分支', '条件判断， true/false 两条路径'],
                ['Switch', '多条件分支，支持多个 case'],
                ['循环', '遍历数组，对每项执行子流程'],
                ['并行', '同时执行多个分支，最后汇合'],
                ['延迟', '等待指定时间后继续'],
                ['子工作流', '调用另一个工作流'],
                ['Try/Catch', '异常捕获和处理'],
              ]}
            />
            <H3>AI 节点</H3>
            <Table
              headers={['节点', '说明']}
              rows={[
                ['AI 对话', '调用大模型生成回复'],
                ['知识库检索', '从知识库中搜索相关文档'],
                ['AI Agent', '多步骤自主决策的 AI 代理'],
              ]}
            />
            <H3>集成节点</H3>
            <Table
              headers={['节点', '说明']}
              rows={[
                ['HTTP 请求', '发送 GET/POST 等请求'],
                ['消息推送', '推送消息到企微/飞书/钉钉'],
                ['代码执行', '运行自定义 JavaScript'],
                ['连接器', '调用已配置的 HTTP/数据库连接'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'editor',
        title: '编辑器使用',
        content: (
          <>
            <H2>编辑器使用指南</H2>
            <H3>画布操作</H3>
            <Table
              headers={['操作', '方式']}
              rows={[
                ['平移画布', '按住空格 + 拖拽，或中键拖拽'],
                ['缩放', '滚轮缩放，或右下角缩放控件'],
                ['选中节点', '单击节点'],
                ['多选', '框选，或 Shift + 单击'],
                ['删除', '选中后按 Delete 键'],
                ['复制粘贴', 'Ctrl+C / Ctrl+V'],
                ['撤销重做', 'Ctrl+Z / Ctrl+Y'],
              ]}
            />
            <H3>节点配置</H3>
            <P>单击节点后，右侧面板会显示该节点的配置项。不同节点类型的配置项不同，但通常包括：</P>
            <P><strong>基础设置</strong> — 节点名称、描述。</P>
            <P><strong>输入参数</strong> — 根据节点类型不同，可能是 URL、Prompt、条件表达式等。</P>
            <P><strong>输出映射</strong> — 定义节点输出如何传递给下游节点。</P>
            <Note type="tip">使用 <Code>{`{{steps.节点名.输出字段}}`}</Code> 语法引用上游节点的输出。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'integration',
    title: '连接器 / 凭证 / 数据源',
    icon: '🔌',
    children: [
      {
        id: 'connectors',
        title: '连接器',
        content: (
          <>
            <H2>连接器</H2>
            <P>连接器保存<strong>外部系统</strong>的连接配置（HTTP、数据库等），供工作流节点直接引用，避免在多个节点重复填写连接信息。</P>
            <H3>典型用法</H3>
            <P><strong>1.</strong> 进入「连接器」页面，点击「新建连接器」。</P>
            <P><strong>2.</strong> 选择连接类型，填写目标地址（如 API Base URL、数据库地址）和认证信息。</P>
            <P><strong>3.</strong> 保存后，在工作流编辑器的「连接器」节点中选择该连接即可调用。</P>
            <Note type="info">连接器适合：统一维护多个工作流共用的外部系统接入配置。连接涉及到的密钥建议配合「凭证」统一管理。</Note>
          </>
        ),
      },
      {
        id: 'credentials',
        title: '凭证管理',
        content: (
          <>
            <H2>凭证管理</H2>
            <P>凭证保存<strong>第三方服务的密钥</strong>：API Key、OAuth 的 Client ID / Client Secret、授权 URL、令牌 URL 等。凭证会被<strong>加密存储</strong>，页面展示时打码。</P>
            <H3>支持的凭证类型</H3>
            <Table
              headers={['类型', '字段', '适用场景']}
              rows={[
                ['API Key', 'apiKey', 'OpenAI / DeepSeek 等模型密钥'],
                ['OAuth 2.0', 'authUrl / tokenUrl / clientId / clientSecret', '第三方平台授权调用'],
                ['Basic Auth', '用户名 / 密码', '基础认证接口'],
              ]}
            />
            <H3>用法</H3>
            <P><strong>1.</strong> 进入「凭证」页面，点击「新建凭证」，选择类型并填写。</P>
            <P><strong>2.</strong> 保存后可在「AI 模型」「连接器」「数据源」等场景中引用该凭证。</P>
            <Note type="warning">API Key 是敏感信息，请妥善保管，切勿分享给他人或提交到公开仓库。</Note>
          </>
        ),
      },
      {
        id: 'data-sources',
        title: '数据接入',
        content: (
          <>
            <H2>数据接入</H2>
            <P>数据源页面支持将外部数据接入平台，供 AI Agent 和知识库使用。</P>
            <H3>支持的数据源类型</H3>
            <Table
              headers={['类型', '说明', '限制']}
              rows={[
                ['表格文件', 'CSV / XLSX / TXT 上传', '单文件 ≤ 2MB'],
                ['对象存储', 'S3 兼容：阿里云 OSS / 腾讯云 COS / AWS S3 / MinIO', '配置 Bucket、AccessKey 等'],
              ]}
            />
            <H3>用法</H3>
            <P><strong>1.</strong> 进入「数据接入」页面，上传文件或配置对象存储。</P>
            <P><strong>2.</strong> 在 AI Agent 调试中，可限制 Agent 可访问的数据源范围（data_access）。</P>
            <Note type="tip">对象存储适合大规模文件；表格文件适合快速验证和中小数据量。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI 模型与 Agent',
    icon: '🤖',
    children: [
      {
        id: 'ai-config',
        title: '模型配置',
        content: (
          <>
            <H2>AI 模型配置</H2>
            <P>在「AI 模型」页面可以配置大模型提供商，支持所有 OpenAI 兼容的 API 接口。</P>
            <H3>支持的提供商</H3>
            <Table
              headers={['提供商', 'API 兼容', '说明']}
              rows={[
                ['OpenAI', '原生', 'GPT-4o, GPT-4, GPT-3.5'],
                ['DeepSeek', 'OpenAI 兼容', 'DeepSeek-V3, DeepSeek-Coder'],
                ['通义千问', 'OpenAI 兼容', 'qwen-max, qwen-plus'],
                ['MiniMax', 'OpenAI 兼容', 'abab 系列模型'],
                ['Ollama', 'OpenAI 兼容', '本地部署的开源模型'],
                ['自定义', 'OpenAI 兼容', '任意兼容的 API 网关'],
              ]}
            />
            <H3>配置步骤</H3>
            <P><strong>1.</strong> 进入「AI 模型」页面，点击「添加提供商」。</P>
            <P><strong>2.</strong> 选择提供商类型，填写 API Key 和 Base URL（密钥可引用「凭证」）。</P>
            <P><strong>3.</strong> 选择默认模型，点击「测试连接」验证配置。</P>
            <P><strong>4.</strong> 保存后，该提供商即可在工作流的 AI 节点中使用。</P>
            <Note type="warning">API Key 是敏感信息，请妥善保管。PlantFlow 会对密钥进行加密存储。</Note>
          </>
        ),
      },
      {
        id: 'ai-knowledge',
        title: '知识库 RAG',
        content: (
          <>
            <H2>知识库 RAG</H2>
            <P>知识库（RAG，检索增强生成）让 AI 能够基于你的企业文档回答问题，而不是仅依赖模型训练数据。</P>
            <H3>工作流程</H3>
            <P><strong>1. 创建知识库</strong> — 在「知识库」页面点击「新建知识库」，填写名称和描述。</P>
            <P><strong>2. 导入文档</strong> — 上传 PDF、Markdown、TXT 等格式的文档，系统自动分段。</P>
            <P><strong>3. 向量化（可选）</strong> — 如果配置了 Embedding 模型，点击「重向量化」生成向量索引。</P>
            <P><strong>4. 在工作流中使用</strong> — 在 AI 对话节点中关联知识库，AI 回答时会自动检索相关文档。</P>
            <H3>检索模式</H3>
            <Table
              headers={['模式', '原理', '要求']}
              rows={[
                ['关键词检索', 'PostgreSQL 全文搜索', '无需额外配置，开箱即用'],
                ['向量检索', '语义相似度匹配', '需要 pgvector 扩展 + Embedding 模型'],
                ['混合检索', '关键词 + 向量融合', '两者都配置，效果最佳'],
              ]}
            />
            <Note type="info">关键词检索基于 PostgreSQL 内置的全文搜索功能，不需要安装额外扩展。</Note>
          </>
        ),
      },
      {
        id: 'prompts',
        title: '提示词模板',
        content: (
          <>
            <H2>提示词模板</H2>
            <P>「提示词」页面提供可复用的 Prompt 模板管理，统一维护 AI 节点的提示词，支持变量占位，避免在多个工作流中重复编写。</P>
            <H3>用法</H3>
            <P><strong>1.</strong> 在「提示词」页面新建模板，填写标题、内容和变量占位符。</P>
            <P><strong>2.</strong> 在工作流的 AI 节点中选择该模板，运行时自动填充变量。</P>
            <Note type="tip">把高频使用的系统提示词沉淀为模板，团队协作更规范。</Note>
          </>
        ),
      },
      {
        id: 'agents',
        title: 'AI Agent 与调试',
        content: (
          <>
            <H2>AI Agent 与调试</H2>
            <P>Agent 是具备工具调用能力的 AI 代理：你描述目标，Agent 自主决定调用哪些工具、按什么顺序执行（N3 Beta）。</P>
            <H3>Agent 调试页面</H3>
            <P><strong>1.</strong> 进入「Agent 调试」页面，AI 会按可用工具枚举自动生成 Agent 配置。</P>
            <P><strong>2.</strong> 在表单中微调：选择可用工具、限制可访问的数据源范围（data_access）。</P>
            <P><strong>3.</strong> 输入测试问题，实时查看 Agent 的推理与工具调用过程。</P>
            <H3>场景模板</H3>
            <P>「场景模板」页面提供<strong>分行业场景模板</strong>（服装、零部件、制造、零售等 9+ 行业，30 套），一键导入即可生成对应工作流，适合快速起步。</P>
            <Note type="warning">Agent 功能当前为 N3 Beta，工具调用细节可能随版本调整。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'chat',
    title: '对话应用',
    icon: '💬',
    children: [
      {
        id: 'chat-create',
        title: '创建对话应用',
        content: (
          <>
            <H2>创建对话应用</H2>
            <P>对话应用将工作流发布为聊天机器人，用户可以通过网页、API 或 IM 平台与之交互。</P>
            <H3>步骤</H3>
            <P><strong>1.</strong> 先创建一个包含「对话触发」节点的工作流。</P>
            <P><strong>2.</strong> 进入「对话应用」页面，点击「新建应用」。</P>
            <P><strong>3.</strong> 选择关联的工作流，配置应用名称、头像、欢迎语。</P>
            <P><strong>4.</strong> 保存后获得一个 API Key 和嵌入代码。</P>
            <H3>接入方式</H3>
            <Table
              headers={['方式', '说明']}
              rows={[
                ['网页聊天窗口', '复制嵌入代码到网站，显示浮动聊天按钮'],
                ['OpenAI 兼容 API', '使用 API Key 调用，兼容 OpenAI SDK'],
                ['独立页面', '直接访问 /chat/:apiKey  URL'],
              ]}
            />
            <H3>API 调用示例</H3>
            <CodeBlock>{`curl https://your-domain.com/api/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "plantflow",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'`}</CodeBlock>
          </>
        ),
      },
      {
        id: 'bot',
        title: 'AI 客服机器人助手',
        content: (
          <>
            <H2>AI 客服机器人助手</H2>
            <P>「机器人助手」是一个<strong>分行业快速搭建 AI 客服</strong>的向导：选择行业 → 自动配置话术 → 创建 Bot，无需手动搭建工作流。</P>
            <H3>使用步骤</H3>
            <P><strong>1.</strong> 进入「机器人助手」页面（左侧导航「Bot」）。</P>
            <P><strong>2.</strong> 选择你的行业（餐饮、零售、汽修、设计、健身等），系统按行业自动配置 AI 客服话术。</P>
            <P><strong>3.</strong> 上传行业资料（如菜单、FAQ 文档），创建 Bot。</P>
            <P><strong>4.</strong> 创建后即可接入渠道（企微/飞书/钉钉）或通过对话应用 API 对外服务。</P>
            <Note type="tip">适合没有技术背景的运营同学快速上线 AI 客服；需要深度定制时改用「工作流 + 对话应用」。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'channels',
    title: '渠道接入',
    icon: '📡',
    children: [
      {
        id: 'channels-config',
        title: '渠道配置',
        content: (
          <>
            <H2>渠道接入</H2>
            <P>PlantFlow 支持将工作流和对话应用接入到企业常用的 IM 平台，实现消息的自动收发。</P>
            <H3>支持的渠道</H3>
            <Table
              headers={['渠道', '功能', '配置要求']}
              rows={[
                ['企业微信', '消息推送 + 回调', '企业 ID、Agent ID、Secret'],
                ['飞书', '消息推送 + 回调', 'App ID、App Secret'],
                ['钉钉', '消息推送 + 回调', 'App Key、App Secret'],
                ['Webhook', '通用 HTTP 回调', '无需配置，自动生成 URL'],
                ['淘宝', '电商消息接入', '淘宝开放平台配置'],
              ]}
            />
            <H3>配置流程（以企业微信为例）</H3>
            <P><strong>1.</strong> 在企业微信管理后台创建应用，获取 CorpID、AgentID、Secret。</P>
            <P><strong>2.</strong> 在 PlantFlow「渠道接入」页面点击「添加渠道」，选择「企业微信」。</P>
            <P><strong>3.</strong> 填写配置信息，设置回调 URL（指向 PlantFlow 的 Webhook 地址）。</P>
            <P><strong>4.</strong> 保存后，在企业微信应用中发送消息即可触发工作流。</P>
            <Note type="warning">回调 URL 必须是公网可访问的 HTTPS 地址。开发环境可使用 ngrok 等工具做内网穿透。</Note>
          </>
        ),
      },
      {
        id: 'inbox',
        title: '会话中心',
        content: (
          <>
            <H2>会话中心（收件箱）</H2>
            <P>「会话中心」实时同步企业微信 / 飞书等渠道的消息，统一查看和处理来自 IM 的对话，无需切换多个平台。</P>
            <H3>功能</H3>
            <P><strong>实时同步</strong> — 渠道消息即时进入收件箱，标记「实时同步」。</P>
            <P><strong>统一回复</strong> — 在会话中心直接回复，或交由关联的 Bot / 工作流自动处理。</P>
            <Note type="info">需要先配置对应渠道（企业微信/飞书），消息才会进入收件箱。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'monitor',
    title: '执行与监控',
    icon: '📊',
    children: [
      {
        id: 'executions',
        title: '执行中心',
        content: (
          <>
            <H2>执行中心</H2>
            <P>「执行中心」查看所有工作流的运行记录，追踪每一次执行的完整日志，支持查看节点级输入输出，方便调试。</P>
            <H3>常见操作</H3>
            <P><strong>查看详情</strong> — 点击一次执行，查看每个节点的输入/输出与耗时。</P>
            <P><strong>失败排查</strong> — 定位报错节点，结合错误信息修复工作流。</P>
          </>
        ),
      },
      {
        id: 'observability',
        title: '可观测性',
        content: (
          <>
            <H2>可观测性</H2>
            <P>「可观测性」页面汇总平台的运行数据：调用量、Token 消耗、执行次数、LLM 用量（<Code>/api/observability/llm-usage</Code>）与 Agent 轨迹（<Code>agent-traces</Code>）等。</P>
            <H3>主要指标</H3>
            <Table
              headers={['指标', '说明']}
              rows={[
                ['LLM 用量', '按模型/时间维度统计 Token 消耗与调用次数'],
                ['Agent 轨迹', '查看 Agent 的工具调用过程与决策路径'],
                ['执行统计', '工作流执行次数、成功率、耗时趋势'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'metrics',
        title: '指标监控',
        content: (
          <>
            <H2>指标监控</H2>
            <P>「指标」页面提供平台的量化指标看板（调用量、执行量、Token 消耗等），支持按时间范围查看趋势。</P>
            <Note type="tip">结合「告警中心」订阅失败通知，第一时间感知异常。</Note>
          </>
        ),
      },
      {
        id: 'alerts',
        title: '告警中心',
        content: (
          <>
            <H2>告警中心</H2>
            <P>「告警中心」提供<strong>失败告警与推送订阅</strong>：工作流执行失败时，通过订阅的渠道（邮件、IM 等）通知到人。</P>
            <H3>使用步骤</H3>
            <P><strong>1.</strong> 在「告警」页面查看失败记录列表。</P>
            <P><strong>2.</strong> 在「推送订阅」中新建订阅，选择通知渠道和触发条件。</P>
            <P><strong>3.</strong> 工作流失败后自动推送告警，及时介入处理。</P>
          </>
        ),
      },
      {
        id: 'cron',
        title: '定时任务',
        content: (
          <>
            <H2>定时任务</H2>
            <P>「定时任务」统一管理所有工作流的 Cron 调度，支持查看、启停、立即执行。</P>
            <H3>用法</H3>
            <P><strong>1.</strong> 在工作流中添加「定时触发」节点并配置 Cron 表达式。</P>
            <P><strong>2.</strong> 在「定时任务」页面查看所有已注册的调度，可手动暂停/恢复。</P>
            <Note type="tip">Cron 表达式示例：<Code>{`0 8 * * *`}</Code> 表示每天 08:00 执行。</Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'system',
    title: '系统管理',
    icon: '🔧',
    children: [
      {
        id: 'admin',
        title: '管理员功能',
        content: (
          <>
            <H2>系统管理</H2>
            <P>「系统管理」页面提供团队管理、成员邀请、审计日志等管理员功能。</P>
            <H3>团队与成员</H3>
            <P>支持邀请制加入团队，管理员可分配角色（管理员 / 开发 / 运营 / 智能体），成员操作全量审计。</P>
            <H3>审计日志</H3>
            <P>记录关键操作（登录、配置变更、成员变更等），可追溯责任。</P>
          </>
        ),
      },
      {
        id: 'faq',
        title: '常见问题',
        content: (
          <>
            <H2>常见问题 FAQ</H2>
            <H3>PlantFlow 和 n8n、Dify 有什么区别？</H3>
            <P>PlantFlow = n8n（流程编排）+ Dify（AI 应用）的组合，并针对工厂/制造/零售做了行业模板和 MES 联动。一次部署同时获得工作流自动化、AI 知识库、多渠道对话三套能力。</P>
            <H3>连接器、凭证、数据源、对话应用分别怎么用？</H3>
            <P><strong>连接器</strong>：保存外部系统（HTTP/数据库）的连接配置，工作流节点直接引用。<strong>凭证</strong>：存第三方密钥（API Key/OAuth），加密存储，供模型/连接器引用。<strong>数据源</strong>：导入表格文件或对象存储数据，供 Agent/知识库使用。<strong>对话应用</strong>：把工作流发布为对外可调的聊天 API，生成 API Key。</P>
            <H3>支持哪些大模型？</H3>
            <P>支持所有 OpenAI 兼容接口：OpenAI、DeepSeek、通义千问、MiniMax、本地 Ollama 等。也支持自建网关。</P>
            <H3>知识库需要向量数据库吗？</H3>
            <P>不是必须的。关键词检索基于 PostgreSQL 全文搜索，开箱即用。向量检索需要安装 pgvector 扩展。</P>
            <H3>提示「请先登录」或「会话已过期」怎么办？</H3>
            <P>一般是登录状态失效或页面缓存了旧版本。请先确认右上角仍显示登录用户；若接口报 401，重新登录即可（Token 有效期 7 天）。若页面行为异常，强制刷新（Ctrl+Shift+R）加载最新版本。</P>
            <H3>渠道消息收不到/回调不生效？</H3>
            <P>确认：① 回调 URL 是公网 HTTPS；② 渠道后台的回调地址与平台生成的 Webhook 一致；③ 企业微信等平台侧已配置可信 IP/回调 Token；④ 消息确实发到了该应用。</P>
            <H3>可以私有化部署吗？</H3>
            <P>可以。Docker Compose 一键部署，数据全部在自己服务器，不依赖外部服务。MIT 开源协议，可自由修改和商用。</P>
            <H3>适合什么场景？</H3>
            <P>工厂自动化、企业内部流程、AI 客服、数据采集、定时报告、多系统集成等。适合需要「流程 + AI」结合的场景。</P>
            <H3>如何升级版本？</H3>
            <CodeBlock>{`# Docker Compose 部署
git pull origin main
docker compose down
docker compose up -d --build

# 数据库迁移会自动执行`}</CodeBlock>
          </>
        ),
      },
    ],
  },
]

export default function Docs() {
  const [activeSection, setActiveSection] = useState(sections[0].id)
  const [activeChild, setActiveChild] = useState(sections[0].children[0].id)
  const [searchQuery, setSearchQuery] = useState('')

  const currentSection = sections.find(s => s.id === activeSection)!
  const currentChild = currentSection.children.find(c => c.id === activeChild) || currentSection.children[0]

  const filteredSections = searchQuery
    ? sections.map(s => ({
        ...s,
        children: s.children.filter(c =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(s => s.children.length > 0)
    : sections

  const handleChildClick = (sectionId: string, childId: string) => {
    setActiveSection(sectionId)
    setActiveChild(childId)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left sidebar - section list (desktop only) */}
      <div className="hidden md:flex w-64 md:h-screen md:sticky md:top-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-col overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-violet-600" />
            <span className="font-bold text-zinc-900 dark:text-zinc-100">帮助文档</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {filteredSections.map(section => (
            <div key={section.id} className="mb-1">
              <button
                onClick={() => {
                  setActiveSection(section.id)
                  setActiveChild(section.children[0].id)
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
                  activeSection === section.id
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span>{section.icon}</span>
                <span>{section.title}</span>
                <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${activeSection === section.id ? 'rotate-90' : ''}`} />
              </button>
              {activeSection === section.id && (
                <div className="ml-4 border-l border-zinc-200 dark:border-zinc-800">
                  {section.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => handleChildClick(section.id, child.id)}
                      className={`w-full text-left px-4 py-1.5 text-sm transition border-l-2 -ml-px ${
                        activeChild === child.id
                          ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-medium'
                          : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      {child.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile nav (hidden on desktop) */}
      <div className="md:hidden border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-2 p-3 pb-2 overflow-x-auto">
          {filteredSections.map(section => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id)
                setActiveChild(section.children[0].id)
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                activeSection === section.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              <span>{section.icon}</span>
              <span>{section.title}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 pb-3 overflow-x-auto">
          {currentSection.children.map(child => (
            <button
              key={child.id}
              onClick={() => handleChildClick(currentSection.id, child.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${
                activeChild === child.id
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium'
                  : 'bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400'
              }`}
            >
              {child.title}
            </button>
          ))}
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">
          {currentChild.content}
        </div>
      </div>
    </div>
  )
}
