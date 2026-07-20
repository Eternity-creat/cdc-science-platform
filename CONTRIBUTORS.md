# CONTRIBUTORS

参与过本项目代码、数据集、文档或实验工作的所有人员名单。

## Core Permanent Team

| GitHub | Name | Role |
|---|---|---|
| [@Eternity-creat](https://github.com/Eternity-creat) | Zhang Zhigao | **System architecture design and core implementation**：三服务拓扑（Frontend / Spring Boot Backend / Python Agent）、LangGraph 双工作流引擎（大纲 + 正文，23 个节点）、RAG 双层检索（prefilter + cosine）、Java 端直算 embedding 通道、文章状态机（status 1→4）与审计留痕、Docker Compose 多服务部署、全套项目文档（README / ARCHITECTURE / API / DATA_FLOW / DEPLOYMENT / 模块设计等） |
| [@jovt0112](https://github.com/jovt0112) | Jiang Ting | Frontend integration & UX polish, Agent workflow wiring, end-to-end real-data integration, writing/polish agent development, Markdown rendering & TOC, image upload & AI image-generation flow, global layout & styles, SSE streaming UI改造, frontend data-contract unification |
| [@fyc2005s](https://github.com/fyc2005s) | Fan Yichen | Database schema design, disease/vaccine Wiki data ingestion, Wiki field mapping, backend-to-frontend 接口联调, mock→real Agent 链路切换, 6-layer writing knowledge system (L0-L5), FastAPI service layer hardening, Wiki upload module integration, project build verification |

### 总体架构设计、整体技术栈选型与项目骨架搭建明细

#### 1. Frontend Architecture（React 18 + Vite 6 + Tailwind + Radix）

- 路由层：6 个页面 + `<BrowserRouter>`，`<AppShell>` 单一 chrome（侧边栏 / 暗色模式 / 主题切换 / 移动端 Drawer）
- 组件层：17 个 shadcn 风格基础 UI（Dialog/Sheet/Select/Tabs/Tooltip 等基于 Radix）+ 5 个业务组件（`Pipeline` 节点轨迹、`ImageGallery` 配图工作台、`MarkdownRenderer` + `CitationBadge` 引用角标、`OutlineNavigator` 目录联动）
- API 客户端层：8 个模块（`index.js` 通用 fetcher + `sse.js` 手动 SSE 解析 + `normalize.js` snake/camelCase 归一化 + article/wiki/gallery/llmConfig/template 业务封装）
- 状态管理：无 Redux/Zustand，全部 `useState` + `useRef`（debounce timer、in-flight promise 等用 ref 避免 re-render）
- Workbench 三相架构：`status 1-2 → outline`、`status 3 → draft`、`status >= 4 → final`，同一组件按状态切换三套 UI（Textarea+预览 / 三栏布局+右侧 4 tab / 只读+导出）
- SSE 流式消费：`runStreamedGeneration(label, requestFn, onStreamText)` 包装，`onChunk` 直接 setState 到 textarea，UI 实时打字机效果；`streamWithFallback` 在 404/405/501 时降级到非流式端点
- 自动保存 / 历史回退：3 秒去抖 `scheduleAutoSave`、与后端 `autosave_pending → manual_edit` 升级模式对齐；`diffWordsWithSpace` 渲染 modification diff 卡

#### 2. Backend Architecture（Spring Boot 4 / Java 21 / MyBatis）

- REST 层：7 个 Controller，~60 个端点，覆盖文章 CRUD + Wiki CRUD + 模板/配置/上传/配图全部场景
- 状态机：以 `cdc_article.status`（1→2→3→4）为单一真相，所有生成/回退/确认都走状态约束；同步 + 流式双通道（`SseEmitter` + `CompletableFuture.runAsync`）
- 审计留痕：四条留痕类型 `manual_edit` / `ai_regenerate` / `autosave_pending` / `revert`，`saveManualContent` + `captureAutoSave` + `revertToModification` 三方法协作，`normalizeContent` 处理最多 6 层 JSON 双重编码嵌套
- Embedding 直算通道：Java 直接调 DashScope OpenAI 兼容 REST，**不经过 Agent 中转**
  - `EmbeddingService` —— 配置从 `cdc_llm_config.embedding` 读，回退 `application.properties`；提供 `computeEmbedding` / `computeEmbeddingsWithCache`（按 25 条/批 + `cdc_embedding_cache` 哈希去重）
  - `EmbeddingEventListener` —— `@Async("embeddingExecutor")` + `@EventListener` 监听 `SegmentChangedEvent`，CREATED/UPDATED 异步算向量、DELETED 同步删 `wiki_segment_embedding`
  - `SegmentChangedEvent` 由 `WikiUploadServiceImpl.confirm` / `WikiServiceImpl` CRUD / 同名实体覆盖前的旧 segment 删除事件触发
  - `ArticleServiceImpl.lazyComputeEmbeddings` 在加载文章上下文时对缺失向量的 segment 同步补算，**保证 Agent 收到的 segments 永远带可用向量**
- Wiki 上传：5 种格式解析（JSON 字段映射覆盖 camel/snake/中英别名、MD/TXT 识别 `MustInclude:` 等规则行前缀、DOCX 用 POI、PDF 用 PDFBox），同名实体采用覆盖策略（先发 DELETED 事件再删再插）
- AgentClient：同步走 `RestTemplate`，流式走 Java 11 `HttpClient` + 手工 SSE 解析（`progress`/`delta`/`replace`/`done`/`error` 五种事件）；`replace` 事件用于 Agent 中途重做时让前端清空累积内容
- 横切关注点：`GlobalExceptionHandler` 统一拦截 RuntimeException/Jackson 错误/参数校验；`AsyncConfig.embeddingExecutor` 独立线程池

#### 3. Agent Architecture（FastAPI + LangGraph 0.2.45）

- 双工作流引擎：
  - `outline_workflow`：intent 解析 → 实体/关联 → preprocess → skill_planner → segment_filter ‖ template_load → compress_knowledge → outline_generate → outline_validate → (ok→END / fail→outline_regenerate, ≤2)
  - `draft_workflow`：在公共子图后接 fusion_generate → [fact_check ‖ rule_check ‖ style_check] → quality_gate → {rule_fail→rule_reflect / fact_fail→reflect_iterate(≤3) / style<0.7→polish / finalize}
  - 公共子图由 `_build_common_graph()` 共享，`compress_knowledge` 与 `outline_validate` 的出边由各工作流自行设置
- 节点清单（23 个）：
  - 15 个由 `*Skill` 后缀实现类支撑的节点（属于 17 个已注册节点的一部分）。下表按 "注册名（`name` 属性）→ graph 节点名" 列出，不一致的两个名字都保留：
    - `intent_parse` → `intent_parse`（`IntentParseSkill`）
    - `compress` → `compress_input`（`CompressSkill`）
    - `entity_fetch` → `entity_extract`（`EntityFetchSkill`）
    - `relation_fetch` → `wiki_relation`（`RelationFetchSkill`）
    - `template_extract` → `template_load`（`TemplateExtractSkill`）
    - `outline_generate` → `outline_generate`（`OutlineGenerateSkill`）
    - `fusion_generate` → `fusion_generate`（`FusionGenerateSkill`）
    - `fact_check` → `fact_check`（`FactCheckSkill`）
    - `rule_check` → `rule_check`（`RuleCheckSkill`）
    - `style_check` → `style_check`（`StyleCheckSkill`）
    - `reflect_iterate` → `reflect_iterate`（`ReflectIterateSkill`）
    - `rule_reflect` → `rule_reflect`（`RuleReflectSkill`）
    - `polish` → `polish`（`PolishSkill`）
    - `outline_validate` → `outline_validate`（`OutlineValidateSkill`）
    - `skill_planner` → `skill_planner`（`SkillPlannerSkill`）
  - 8 个 workflow 基础设施节点：`skip_intent` / `epidemic_preprocess` / `vaccine_preprocess` / `general_preprocess` / `segment_filter` / `compress_knowledge` / `outline_regenerate` / `finalize`
- 路由函数：
  - `should_parse_intent` / `route_by_entity_type` / `should_generate_outline` / `should_validate_outline` —— 入口和分支决策
  - `quality_gate` —— 优先级：`retry>=3 → finalize` / `rule_passed=false → rule_reflect` / `is_fact_ok=false → reflect_iterate` / `style<0.7 → polish` / else → `finalize`
- LLM 调用层：
  - `LLMClient` —— httpx 异步 + `asyncio.Semaphore(5)` + tenacity 重试 + 中文错误翻译，per-call 300s 超时
  - `LLMClientPool` + `ConfigManager` —— 60s TTL 缓存从 `cdc_llm_config` 拉的配置，`params` JSON 变化触发 client 重建
  - `EmbeddingModel` —— DashScope `/embeddings`（调试用，主链路在 Java 端）
- SSE 流式：`asyncio.Queue` + `ContextVar` 回调，节点内 LLM 流式输出经 `stream_callback` 入队；事件类型 `progress`/`delta`/`replace`/`done`/`error`；**主动拒绝伪流式**（首段未到达但 task 已结束则抛错）
- 配图链路（不进 graph）：`/api/agent/generate-images` → section_analyze 节点（`SectionAnalyzeSkill` 实现类）→ image_generate 节点（`ImageGenerateSkill` 实现类）调 SenseNova U1 Lite / qwen-image → 本地 `uploads/images/` + `StaticFiles` 暴露

#### 4. RAG Architecture

- 第一层 · 预过滤（`app/tools/rag_retrieval.prefilter_segments`）
  - 主实体类型（disease=1, vaccine=2）的 segment 全保留
  - 上下文实体类型（population=3, scene=4）的 segment 必须包含主实体 alias / population / scene 关键词才保留
  - 无 `owner_entity_type` 的历史 segment 视为兼容保留
- 第二层 · 向量相似度（`app/tools/vector_store.VectorStore.search_with_embeddings`）
  - 走预计算向量模式（Java 已把向量存到 `wiki_segment_embedding`，前端拿 context 时透传）
  - 只对查询文本做 1 次 embedding API 调用
  - 纯 Python 余弦相似度（无 numpy 依赖），Top-K=10
  - 降级路径 `search_in_memory` 实时 embed 所有 segment（慢但可用）
- 第三层 · 知识压缩（`workflow/nodes.compress_knowledge_node`）
  - 按距离中位数过滤，最多保留 8 条
  - 控制后续 LLM prompt 体积
- Embedding 缓存：
  - `cdc_embedding_cache` —— MD5(content) + model_version 唯一键，跨 segment 复用
  - `wiki_segment_embedding` —— segment 级持久化（一对一）
  - 双层架构：`cdc_embedding_cache` 命中 → 复用；未命中 → 调 API → 写回 cache + upsert 持久化
- 查询构造（`build_retrieval_query`）：`"<entity> <population>相关 <scene>场景 <user_text[:100]>"`
- 引用追溯：`fusion_generate` 解析模型输出中的 `{ref:N}` 标记，映射回 segment DB ID → 写 `state.cited_segment_ids` → `AgentResponse.generation_meta.citedSegmentIds` → 前端 `CitationBadge` 展示

#### 5. Embedding 通道（全栈视角）

| 阶段 | 触发点 | 计算位置 | 存储位置 |
|---|---|---|---|
| Wiki 文档入库 | `WikiUploadServiceImpl.confirm` 发 `SegmentChangedEvent.CREATED` | Java 端 `EmbeddingService`（异步） | `wiki_segment_embedding` |
| Wiki 片段 CRUD | `WikiServiceImpl.addSegment` / `updateSegment` / `deleteSegment` 发事件 | 同上 | 同上 |
| 同名实体覆盖 | `WikiUploadServiceImpl.confirm` 命中旧实体时对每条旧 segment 发 `DELETED` | Java 端 `EmbeddingEventListener.handleDelete` | 同步删 `wiki_segment_embedding` |
| 文章生成 | `ArticleServiceImpl.buildContextFromArticle` 检查 segment embedding | Java 端惰性补算（同步，命中 `cdc_embedding_cache`） | `wiki_segment_embedding` |
| RAG 查询 | Agent 端 `segment_filter_node` | Agent 端 `EmbeddingModel` 算查询向量（1 次） | 内存比对 |

#### 6. Deploy / DevOps

- `docker-compose.yml` —— 5 服务编排（mysql / backend / agent / frontend / nginx），健康检查 + 启动依赖链（mysql healthy → backend healthy → agent healthy；nginx 依赖 frontend/backend/agent）
- `nginx/default.conf` —— 反向代理规则，按路径分发 + SSE 长连接 `proxy_read_timeout 300s` + Gzip
- `deploy.sh` / `deploy.bat` / `ci-deploy.sh` —— 一键部署脚本
- `.env.example` —— 环境变量模板与默认值
- 端口约定：nginx :80（公开）/ backend :8080 / agent :8001 / mysql :3306（后三者 docker-compose 内可调，部署文档建议只开放 nginx）

#### 7. Documentation & Maintenance

- `README.md` / `ARCHITECTURE.md` / `docs/API.md` / `docs/DATA_FLOW.md` / `docs/DEPLOYMENT.md` / `docs/WIKI_UPLOAD_MODULE_DESIGN.md` / `docs/WIKI_UPLOAD_API_USAGE.md` / `docs/ARCHITECTURE_DIAGRAM.md` / `docs/README.md` —— 全套文档撰写与持续更新
- `CHANGELOG.md` —— 版本变更记录（按 Keep a Changelog 格式）
- `CONTRIBUTORS.md` / `CONTRIBUTING.md` —— 团队与贡献规范维护

## Contributors

| Name | Role |
|---|---|
| Mao Yinji | 人群和场景知识库数据集构建 |
| Tian Yanjing | 人群和场景知识库数据集构建、项目前期数据调研整理 |

## External Open-Source Contributors

本项目使用 LangGraph、FastAPI、Spring Boot、React、Vite、shadcn/ui 等开源框架，感谢上游社区的所有贡献者。完整列表见各项目的 GitHub Contributors 页面。
