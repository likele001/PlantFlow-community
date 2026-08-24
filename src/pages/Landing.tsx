import { Link } from 'react-router-dom'
import {
  Workflow, Sparkles, MessageCircleMore, Activity,
  ArrowRight, Zap, Globe, BookOpen, ChevronRight,
  GitBranch, Cpu, Database,
  Factory, Palette, Users, KeyRound, BellRing,
  Package, ScanSearch, Boxes, PlugZap
} from 'lucide-react'

const features = [
  { icon: <Workflow className="w-6 h-6" />, title: '可视化工作流编辑器', desc: '拖拽式编排，30+ 节点类型：触发器、条件分支、并行、循环、子工作流、AI、HTTP 集成，零代码完成复杂自动化。' },
  { icon: <Sparkles className="w-6 h-6" />, title: 'AI 大模型 + 智能体', desc: '接入 OpenAI、DeepSeek、通义千问等主流模型，支持对话、知识库 RAG、多轮 AI Agent 自主调用工具。' },
  { icon: <MessageCircleMore className="w-6 h-6" />, title: '多渠道对话', desc: '企业微信、飞书、钉钉、网页插件、淘宝统一接入，客户/员工直接在聊天里和你的 AI 对话。' },
  { icon: <BookOpen className="w-6 h-6" />, title: '知识库 RAG', desc: '上传文档自动分段向量化，关键词 + 语义混合检索，让 AI 的回答基于你的真实业务。' },
  { icon: <Activity className="w-6 h-6" />, title: '执行中心与审计', desc: '完整运行日志、节点级输入输出追踪，全量审计留痕，问题可回溯。' },
  { icon: <BellRing className="w-6 h-6" />, title: '告警中心与可观测', desc: '执行失败/异常自动告警，站内通知 + Webhook 推送，运营计量看板实时掌握用量与成本。' },
]

const newFeatures = [
  { icon: <Factory className="w-6 h-6" />, title: 'MES 生产联动', desc: 'MES 事件触发工作流，执行结果自动写回 MES 回调地址；支持结果模板占位符，打通「生产现场 ↔ 自动化流程」。' },
  { icon: <Palette className="w-6 h-6" />, title: 'AI 改图', desc: '工作流编辑器内置 AI 改图：指令改图、diff 对比、一键应用，商品图/素材迭代分钟级完成。' },
  { icon: <Boxes className="w-6 h-6" />, title: '行业模板市场', desc: '30 套分行业场景模板（服装、零部件、制造、零售…），一键导入生成 Agent + 工作流，开箱即用。' },
  { icon: <Users className="w-6 h-6" />, title: '团队协作与权限', desc: '邀请成员加入团队，多级角色权限（管理员/开发/运营/智能体），操作全量审计，安全可控。' },
  { icon: <KeyRound className="w-6 h-6" />, title: '连接器与凭证', desc: '连接器统一管理 HTTP/数据库外部系统连接，凭证加密存储第三方密钥，数据源接入 CSV/对象存储，供工作流与 Agent 直接使用。' },
  { icon: <PlugZap className="w-6 h-6" />, title: '开放集成', desc: 'Webhook、路径触发、开放 API、数据源连接、CSV 批量导入，轻松对接 ERP、门店与存量系统。' },
]

const industries = [
  {
    icon: <Package className="w-6 h-6" />,
    name: '服装 / 服饰',
    desc: '覆盖从接单到出货的全链路：',
    templates: ['订单跟单追踪', '面料辅料库存', '生产工序进度', '成衣质检', '打版工艺问答', '每日生产日报'],
  },
  {
    icon: <ScanSearch className="w-6 h-6" />,
    name: '零部件 / 机加',
    desc: '覆盖从进料到出货的质量与交付：',
    templates: ['工序进度', 'IQC 进料检验', '质量追溯', '齐套缺料预警', '刀具工装寿命', 'OQC 出货检验'],
  },
  {
    icon: <Globe className="w-6 h-6" />,
    name: '通用行业',
    desc: '各行各业都能直接用的通用能力：',
    templates: ['AI 智能客服', '运营日报推送', '异常告警通知', '文档智能问答', '数据同步', '审批分流'],
  },
]

const nodeTypes = [
  { name: '触发器', items: ['手动', '对话', 'Webhook', '定时 Cron', 'MES 事件', '企微/飞书/钉钉'] },
  { name: '逻辑', items: ['IF 分支', 'Switch', '循环', '并行', '汇合', '延迟', '子工作流', 'Try/Catch'] },
  { name: 'AI', items: ['AI 对话', '知识库检索', 'AI Agent', 'AI 改图'] },
  { name: '集成', items: ['HTTP 请求', '消息推送', '代码执行', '结果写回 MES'] },
]

const steps = [
  { num: '01', title: '配置 AI 模型', desc: '在「AI · 模型」中接入你的大模型 API，支持任意 OpenAI 兼容网关。', icon: <Cpu className="w-8 h-8" /> },
  { num: '02', title: '导入知识库 / 模板', desc: '上传企业文档自动分段，或从行业模板市场一键导入现成场景。', icon: <Database className="w-8 h-8" /> },
  { num: '03', title: '编排工作流', desc: '拖拽节点设计自动化流程：触发 → 处理 → AI → 输出，连接 MES/企微/飞书/钉钉。', icon: <GitBranch className="w-8 h-8" /> },
  { num: '04', title: '发布上线', desc: '发布后定时/Webhook/对话/MES 事件自动触发，全程可观测、可审计。', icon: <Zap className="w-8 h-8" /> },
]

const faqs = [
  { q: 'PlantFlow 和 n8n、Dify 有什么区别？', a: 'PlantFlow = n8n（流程编排）+ Dify（AI 应用）的组合，并针对工厂/制造/零售做了行业模板和 MES 联动。一次部署同时获得工作流自动化、AI 知识库、多渠道对话三套能力。' },
  { q: '连接器、凭证、数据源、对话应用分别怎么用？', a: '连接器：保存外部系统（HTTP/数据库）的连接配置，工作流节点直接引用，统一维护。凭证：存第三方密钥（API Key/OAuth），加密存储，供模型和连接器引用。数据源：导入表格文件（CSV/XLSX/TXT）或对象存储（阿里云OSS/腾讯云COS/AWS S3/MinIO）数据，供 AI Agent 使用。对话应用：把工作流发布为对外可调的聊天 API，生成 API Key，外部系统通过 OpenAI 兼容接口接入。' },
  { q: '能对接 MES / ERP 吗？', a: '可以。MES 事件可触发工作流，执行结果自动写回 MES 回调地址（支持结果模板占位符）；同时提供 Webhook、路径触发和开放 API，可对接 ERP、门店等存量系统。' },
  { q: '有哪些行业模板？', a: '目前内置 30 套分行业场景模板，覆盖服装（订单跟单、面料库存、成衣质检、打版工艺问答）、零部件（IQC、质量追溯、齐套缺料预警、OQC）、制造、零售等 9+ 行业，一键导入即可用。另有「机器人助手」按行业（餐饮/零售/汽修等）自动配置 AI 客服话术。' },
  { q: '支持团队协作吗？', a: '支持。邀请制加入团队，5 级角色权限（平台管理员/租户管理员/开发/运营/智能体），一个账号可在多个租户间切换，操作全量审计。' },
  { q: '怎么收费？', a: '本开源版（MIT 协议）完全免费，可自行部署商用。如需多租户、计费钱包、套餐订阅、平台运营管理等功能，可获取商业版源码（详见仓库 README）。' },
  { q: '提示「请先登录」或「会话已过期」怎么办？', a: '一般是登录状态失效或页面缓存了旧版本。先确认右上角仍显示登录用户；接口报 401 时重新登录即可（Token 有效期 7 天，重新登录会刷新）。页面行为异常时强制刷新（Ctrl+Shift+R）加载最新版本。' },
  { q: '支持哪些大模型？', a: '支持所有 OpenAI 兼容接口：OpenAI、DeepSeek、通义千问、MiniMax、本地 Ollama 等，也支持自建网关。' },
  { q: '可以私有化部署吗？', a: '可以。Docker Compose 一键部署，数据全部在自己服务器，不依赖外部服务。MIT 开源协议，可自由修改和商用。' },
  { q: '数据安全怎么样？', a: '登录使用服务端 Session（数据库校验），Token 有效期 7 天；第三方密钥加密存储；支持多租户数据隔离；关键操作全量审计。' },
  { q: '渠道消息收不到 / 回调不生效？', a: '确认：① 回调 URL 是公网 HTTPS；② 渠道后台回调地址与平台 Webhook 一致；③ 企业微信等平台已配置可信 IP；④ 消息确实发到该应用。' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Workflow className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">PlantFlow</span>
            <span className="text-xs text-gray-400 hidden sm:inline">厂流</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">功能</a>
            <a href="#industry" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">行业模板</a>
            <a href="#how" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">快速开始</a>
            <a href="#faq" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">FAQ</a>
            <Link to="/docs" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">文档</Link>
            <Link to="/login" className="text-sm font-medium text-violet-600 hover:text-violet-700">登录</Link>
            <Link to="/login" className="text-sm font-medium bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition">登录体验</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-50/80 to-white pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center relative">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-medium px-3 py-1 rounded-full mb-6">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span></span>
            MIT 开源 · 可私有化部署 · 30 套行业模板 · MES 联动
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            给工厂与商家装上<br />
            <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">24 小时在线的「AI 员工」</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-500 max-w-3xl mx-auto leading-relaxed">
            可视化工作流 + AI 知识库 + 多渠道对话 一体平台。<br className="hidden md:block" />
            从订单跟单、生产工序、质量追溯，到 7×24 AI 客服 —— 在企微/飞书/钉钉里直接对话，开箱即用。
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-violet-700 transition shadow-lg shadow-violet-200">
              立即开始 <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="https://github.com/likele001/PlantFlow" rel="noopener" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-6 py-3 rounded-xl font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-400">演示账号：admin@example.com / admin123</p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-3 md:grid-cols-6 gap-8 text-center">
          {[
            { n: '30+', l: '节点类型' },
            { n: '30', l: '行业模板' },
            { n: '9+', l: '覆盖行业' },
            { n: '4+', l: '渠道接入' },
            { n: '5', l: '团队角色' },
            { n: 'MIT', l: '开源协议' },
          ].map(s => (
            <div key={s.l}>
              <div className="text-2xl md:text-3xl font-bold text-violet-600">{s.n}</div>
              <div className="text-sm text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Core Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">为什么选择 PlantFlow</h2>
          <p className="mt-4 text-gray-500 max-w-xl mx-auto">一套平台，同时解决流程自动化、AI 落地与渠道触达三大需求。</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map(f => (
            <div key={f.title} className="group p-6 rounded-2xl border border-gray-100 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-50 transition-all">
              <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-4 group-hover:bg-violet-100 transition">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* New Highlights */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-3 py-1 mb-3">
              <Sparkles className="w-3.5 h-3.5" /> 最新能力
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">近期亮点，一次到位</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">面向制造与零售的实战能力，持续迭代中。</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {newFeatures.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl bg-white border border-gray-100 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-50 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center group-hover:bg-violet-700 transition">
                    {f.icon}
                  </div>
                  <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">NEW</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry Templates */}
      <section id="industry" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-3 py-1 mb-3">
            <Boxes className="w-3.5 h-3.5" /> 行业模板市场
          </div>
          <h2 className="text-3xl md:text-4xl font-bold">30 套分行业模板，一键导入</h2>
          <p className="mt-4 text-gray-500 max-w-xl mx-auto">每个模板自动生成「智能体 + 工作流」，导入即用，省去从零搭建。</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {industries.map(ind => (
            <div key={ind.name} className="rounded-2xl border border-gray-100 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-50 transition-all p-6">
              <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-4">
                {ind.icon}
              </div>
              <h3 className="text-lg font-semibold mb-1">{ind.name}</h3>
              <p className="text-sm text-gray-500 mb-4">{ind.desc}</p>
              <div className="flex flex-wrap gap-2">
                {ind.templates.map(t => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Node Types */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">30+ 节点类型，覆盖全场景</h2>
            <p className="mt-4 text-gray-500">从触发到 AI 到输出，一站式编排。</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {nodeTypes.map(g => (
              <div key={g.name} className="bg-white rounded-2xl p-6 border border-gray-100">
                <h4 className="font-semibold text-violet-600 mb-3">{g.name}</h4>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(i => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{i}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">4 步上手</h2>
          <p className="mt-4 text-gray-500">从零到生产，最快 30 分钟。</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map(s => (
            <div key={s.num} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
                {s.icon}
              </div>
              <div className="text-xs font-bold text-violet-400 mb-2">STEP {s.num}</div>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-violet-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">解决商家的真实痛点</h2>
            <p className="mt-4 text-violet-200">从客服到生产，把重复劳动交给 AI 员工。</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { t: '7×24 AI 智能客服', d: '客户在企微/飞书/钉钉直接提问，AI 基于知识库秒回，深夜也有人值班。' },
              { t: '订单 / 工单跟单', d: '客户问「我的订单到哪了」，AI 自动查进度回复，告别人工翻表。' },
              { t: '生产工序与缺料预警', d: '工序进度实时可查，齐套缺料自动告警推给采购，减少停工等料。' },
              { t: '质量追溯（IQC/OQC）', d: '进料/出货检验记录、批次追溯，出问题一键查根因。' },
              { t: '运营日报推送', d: '定时拉取数据 → AI 汇总 → 飞书/企微自动推送，管理决策不迟到。' },
              { t: '多系统数据同步', d: '对接 MES/ERP/门店，事件触发 → 数据转换 → 自动写入目标系统。' },
            ].map(c => (
              <div key={c.t} className="bg-white/10 backdrop-blur rounded-2xl p-6">
                <h4 className="font-semibold mb-2">{c.t}</h4>
                <p className="text-sm text-violet-200">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">常见问题</h2>
        </div>
        <div className="space-y-4">
          {faqs.map(f => (
            <details key={f.q} className="group border border-gray-100 rounded-2xl overflow-hidden">
              <summary className="px-6 py-4 cursor-pointer font-medium text-gray-900 hover:bg-gray-50 transition list-none flex items-center justify-between">
                {f.q}
                <ChevronRight className="w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-6 pb-4 text-sm text-gray-500 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">开始自动化你的业务</h2>
          <p className="text-gray-500 mb-8 max-w-lg mx-auto">MIT 开源，免费使用。Docker 一键部署，数据完全自主可控。商业版提供多租户与计费系统，可联系获取。</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-violet-700 transition shadow-lg shadow-violet-200">
              立即登录 <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="https://github.com/likele001/PlantFlow" rel="noopener" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-3 rounded-xl font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
              查看源码
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Workflow className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold">PlantFlow</span>
              </div>
              <p className="text-sm text-gray-500">可视化工作流编排 + AI 知识库 + 多渠道对话平台，面向工厂与商家。</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">产品</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="#features" className="block hover:text-gray-900">功能特性</a>
                <a href="#industry" className="block hover:text-gray-900">行业模板</a>
                <a href="#how" className="block hover:text-gray-900">快速开始</a>
                <Link to="/docs" className="block hover:text-gray-900">用户手册</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3">资源</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="https://github.com/likele001/PlantFlow" className="block hover:text-gray-900">GitHub</a>
                <a href="/api/health" className="block hover:text-gray-900">健康检查</a>
                <Link to="/docs" className="block hover:text-gray-900">部署文档</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3">关于</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <a href="https://cenkor.cn" className="block hover:text-gray-900">辰科 Cenkor</a>
                <span className="block">MIT License</span>
                <span className="block">contact@cenkor.cn</span>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PlantFlow &middot; 辰科 Cenkor &middot; MIT License
          </div>
        </div>
      </footer>
    </div>
  )
}
