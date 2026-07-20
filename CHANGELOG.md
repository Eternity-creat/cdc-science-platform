# 版本变更记录

> **节点命名说明**：本文件按 graph 节点名引用节点；4 个节点的注册名（`SkillRegistry.get_skill()` 用的 `name` 属性）与 graph 节点名不一致，详见 [ARCHITECTURE.md "已注册节点清单"](./ARCHITECTURE.md)。

本项目的所有重要变更都记录在此文件中。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [1.3.0] - 2026-07-19

### 新增（后端架构）

- **Embedding 计算下沉到 Java 端**：新增 `EmbeddingService` + `EmbeddingEventListener`，由 Java 直接调 DashScope `/embeddings`，**不再经 Agent 中转**。每次 `wiki_segment` 增/删/改通过 `SegmentChangedEvent` 异步驱动，`@Async("embeddingExecutor")` 在独立线程池里完成「MD5 哈希 → embedding API → JSON 序列化 → upsert `wiki_segment_embedding`」。
- **`cdc_embedding_cache` 哈希去重**：`EmbeddingService.computeEmbeddingsWithCache(texts, sourceType, sourceIds)` 先按 `(content_hash, model_version)` 查缓存，未命中再分批（≤25 条/批）调 API，写回缓存表。
- **惰性 embedding 补算**：`ArticleServiceImpl.buildContextFromArticle` 在加载文章上下文时，检查每个 segment 是否已有 embedding，缺则用上面的缓存 + 直算通道补齐，**保证 Agent 收到的 segments 永远带可用向量**。
- **`AsyncConfig.embeddingExecutor`**：corePool=2 / maxPool=4 / queueCapacity=50 / prefix=`embedding-`。

### 新增（Agent 流式）

- **SSE `replace` 事件转发**：`AgentClient.handleSseMessage` 在收到 Agent 的 `event: replace` 时通过 `onReplace` 回调推给前端，让前端清空已累积内容并整体替换，避免初稿生成阶段出现"前后两版叠加"的渲染 bug（commit `20e27c0`）。
- **`citedSegmentCount` 改实际引用数**：fusion_generate 节点（`FusionGenerateSkill` 实现类）把草稿中真实出现的 `{ref:N}` 数量回传到 `generation_meta.citedSegmentCount`，而不是 RAG 检索返回的 Top-K 数（commit `f6d7a5c` 起多个修复）。
- **`citedSegmentIds`**：新增字段，把实际被引用的 segment DB ID 列表写入 `generation_meta`，前端可基于此精确构建引用角标。

### 新增（前端）

- **右侧 Pipeline 面板美化**：状态色边框、操作图标、diff 色条；指标标签防截断；实体信息表格对齐（commit `980357d`、`99b241d`、`83586b4`、`a09d69d`）。
- **上下文面板布局美化**：修复配图段落标签显示位置（commit `790b13e`）。
- **配图面板重构**：单列全宽、删除二次确认并同步清除草稿引用、生成后弹窗确认插入、对齐调整不重复插入、上传图持久化用户选择的段落到 DB、终稿阶段隐藏生成/上传按钮（`6972b20` ~ `15acaac` 系列提交）。
- **合并文章与上下文加载**：消除引用标签和右侧面板渲染闪烁（commit `849f990`）。
- **知识引用数量改 Agent RAG 直传**：`citedSegmentCount` 与 `citedSegmentIds` 直接透传展示，citation badge 改为方形（commit `b713ce4`）。
- **历史回退生效修复**：`5548842`、`609dce1`、`8ea989f`、`73060c4`、`f9a623d` 一系列修复，确保 `revertToModification` 真正把目标版本写回 article，且回退本身也作为一条 `revert` 类型 modification 留痕。
- **`normalizeContent` 历史转义归一化**：处理早前端多次 JSON 双重编码导致的脏数据（commit `c4efdfd`）。

### 新增（Agent RAG 优化）

- **`rag_retrieval.prefilter_segments`**（commit `e6acdd9`）：第一层预过滤区分主实体（disease/vaccine）与上下文实体（population/scene），避免不相关场景片段靠向量高分挤进 Top-K；保留无 `owner_entity_type` 的老数据向后兼容。
- **`agent trace` 显示增强**（commit `d19da0f`）：Pipeline 组件显示每个节点的步骤名、耗时、输出字符/段落数、模型、输入输出预览。

### 修复

- **初稿流式渲染重复**：commit `20e27c0` 转发 Agent `replace` SSE 事件到前端（曾被 `a8ff77d` revert 后重新以正确语义落地）。
- **段落标签位置**：commit `27eb82d` 让图片段落编号从 heading 中正确提取展示。
- **历史回退可视化**：`5548842` 让 history revert 应用的内容在 UI 上立即可见。
- **`c4efdfd`** 旧版历史换行归一化，避免 `\r\n` vs `\n` 造成 diff 误判。

### 变更

- `WikiServiceImpl` 在 segment / rule / relation 的 CRUD 上统一发 `SegmentChangedEvent`，由 `EmbeddingEventListener` 异步补算向量
- `ArticleServiceImpl.buildContextFromArticle` 在加载 segments 时增加 `lazyComputeEmbeddings` 步骤
- `AgentClient.buildAndStream` 新增 `onReplace` Consumer，对应 SSE `event: replace` 的清空 + 替换语义
- `ArticleController` 暴露 `/generate-outline/stream`、`/generate-draft/stream`、`/regenerate-outline/stream`、`/regenerate-draft/stream` 四个 SSE 端点

## [1.2.2] - 2026-07-05

### 修复

- **后端部署触发**：commit `e6192a9` 同步后端镜像构建与部署流水线修复
- **前端依赖锁同步**：commit `0de9e50` 同步 `package-lock.json`

## [1.2.1] - 2026-06-21

### 修复（LLM 超时问题）

- **compress_knowledge 无距离时全量灌入**：`compress_knowledge_node` 在无距离信息时从"跳过压缩"改为"截断到前 8 条"，避免所有知识片段未压缩地传入 LLM prompt 导致超时
- **fusion prompt 知识片段无上限**：`build_fusion_prompt()` 对 `wiki_segments` 和 `top_k_segment_list` 增加 `[:10]` 截断，与 `build_outline_prompt()` 保持一致
- **httpx read timeout 不足**：`_REQUEST_TIMEOUT` read 值从 180s 提升到 300s，适配动态 prompt 注入 Layer 1-4 写作知识后的大 prompt 场景，与 Nginx `proxy_read_timeout 300s` 对齐
- **ConfigManager 缓存无 TTL**：`ConfigManager._cache` 和 `LLMClientPool._clients` 新增 60 秒 TTL 自动过期 + 配置变更检测（model/apiKey/baseUrl 三元组比对），LLM 配置修改后 60 秒内自动生效，无需重启 Agent
- **`_TEXT_SUB_TYPES` 白名单不全**：新增 `skill_planner`、`outline_validate`、`style_check`、`polish`、`rule_reflect`、`outline_generate`、`fusion_generate` 7 个子类型，确保所有 LLM 调用的 Skill 都能正确回退到 `text_generation` 配置

## [1.2.0] - 2026-06-21

### 新增（写作知识体系）

- **6 层渐进式披露写作 Skill 体系**：新增 `app/skills/writing/` 目录，包含元索引、通用规则、6 种文章类型蓝图、5 种受众画像、8 种技法卡片、6 种质量基准
  - Layer 0: `skill_index.yaml` — 元索引，映射所有文章类型、受众、技法的代码和文件路径
  - Layer 1: `universal_rules.md` — CDC 科普文基线规范、微信平台规范、安全红线
  - Layer 2: `blueprints/` — 6 种文章类型蓝图（disease_explainer, vaccine_guide, outbreak_alert, myth_buster, seasonal_health, case_story）
  - Layer 3: `audiences/` — 5 种受众画像（general_public, parents, elderly, students, healthcare_workers）
  - Layer 4: `techniques/` — 8 种技法卡片（hook_opening, data_presentation, analogy_explanation, myth_bust_pattern, cta_closing, emotion_writing, faq_pattern, wechat_formatting）
  - Layer 5: `quality/` — 6 种文章类型对应的 40 分制质量基准评分细则
- **SkillLoader 单例**（`app/skills/writing/skill_loader.py`）：按层级读取并缓存写作知识文件，提供 `get_blueprint()`、`get_audience_profile()`、`get_techniques()`、`get_quality_benchmark()` 等接口
- **SkillPlannerSkill**（`skill_planner`）：LLM 自动分类文章类型、匹配受众画像、选择最多 5 个写作技法，预加载 Layer 2-5 内容到 `state["skill_plan"]`

### 新增（工作流节点）

- **OutlineValidateSkill**（`outline_validate`）：大纲生成后自动校验结构完整性、must_include 覆盖、蓝图必需章节
- **StyleCheckSkill**（`style_check`）：评估可读性 6 维指标（句长、被动语态、专业术语密度、段落长度、标题层级、过渡词），输出 `style_score`（0-1）
- **PolishSkill**（`polish`）：文笔润色，平滑过渡、消除冗余、统一语气，保留 `{ref:N}` 引用标注和事实准确性
- **RuleReflectSkill**（`rule_reflect`）：根据 `rule_check_report` 补充缺失的 must_include 要点、删除 must_not_say 违规表述
- **quality_gate 统一路由函数**：三路并行校验（fact_check + rule_check + style_check）后统一决策：全部通过 → 润色；事实失败 → 反思迭代；规则失败 → 规则修正；重试超限 → 强制结束

### 新增（动态 Prompt 组装）

- `build_fusion_prompt(state)`：动态组装正文生成 prompt，注入 Layer 1-4 写作知识 + template_tone + 受众画像微调
- `build_outline_prompt(state)`：动态组装大纲生成 prompt，注入 Layer 1-3 写作知识
- `OutlineGenerateSkill` 和 `FusionGenerateSkill` 优先读取 `state["_dynamic_prompt"]`，不存在时回退到固定模板

### 修复

- **compress_knowledge 空函数**：`CompressSkill` 从空实现改为基于中位数距离的知识过滤（保留距离 ≥ 中位数的片段，最多 8 条）
- **rule_check 结果未被消费**：`RuleCheckSkill` 新增 `rule_check_report` 输出字段（JSON 格式含 missing_points 和 violated_rules），`rule_check_node` 正确传递到 state
- **reflect_iterate 只修事实不管规则**：新增独立的 `RuleReflectSkill` 专门处理规则修正，与事实修正的 `ReflectIterateSkill` 职责分离
- **nodes.py 字段名不一致**：`rule_check_node` 从 `result.get("check_report")` 修正为 `result.get("rule_check_report")`

### 变更

- `AgentState` 新增 7 个字段：`skill_plan`, `style_score`, `quality_score`, `style_report`, `outline_valid`, `outline_feedback`, `rule_check_report`
- `SkillRegistry` 从 12 个 Skill 扩展到 17 个
- `compress_knowledge_node` 从空操作改为有效的知识过滤逻辑
- `reflect_iterate_node` 改为局部修正模式，增加 wiki_segments 知识源支持
- `REFLECT_ITERATE_PROMPT` 重写为局部修正专家角色，明确要求保留 `{ref:N}` 标注
- `requirements.txt` 新增 `PyYAML>=6.0` 依赖
- 正文工作流升级为三路并行校验 + quality_gate 统一路由 + polish 润色 + rule_reflect 规则修正
- 大纲工作流新增 outline_validate 校验节点和 outline_regenerate 重新生成节点

## [1.1.0] - 2026-06-20

### 修复（后端）

- **WikiRule entityId 丢失**（BUG-NEW-1）：`WikiRule.java` 新增 `entityId` 字段，修复规则插入时 `entity_id` 列写入 NULL 的问题
- **parse-intent 参数绑定**（BUG-NEW-2）：Python Agent `parse-intent` 接口改用 `Body(..., embed=True)` 从 JSON body 读取参数，修复 Java 后端 POST body 调用失败
- **confirmFinal 空指针**（BUG-NEW-3）：`confirmFinal` 方法新增文章和初稿空值校验，避免 `article == null` 或 `initialDraft == null` 时 NPE
- **getArticle 返回 null 未处理**（BUG-NEW-4）：新增 `getArticleOrThrow()` 私有方法，9 个关键调用方替换为空值安全的获取方式
- **regenerateOutline 重复插入**（BUG-NEW-5）：`regenerateOutline` 中修改记录的 `afterContent` 更新从 `insert` 改为 `updateById`，Mapper 新增对应方法和 SQL
- **AgentClient 错误处理**（BUG-NEW-6）：Agent 调用失败和错误响应从 `return` 错误字符串改为 `throw RuntimeException`，确保上层正确捕获和处理
- **imageKey 并发冲突**（BUG-NEW-8）：`generateImageKey` 从计数方式改为 `时间戳 + 随机数`，避免并发请求生成相同 key
- **回退空内容**（BUG-NEW-9）：`revertToModification` 新增 `beforeContent` 空值校验，防止回退到空内容
- **Controller 输入校验**（BUG-NEW-10）：`autoSave` 和 `revert` 端点新增必填参数校验，返回明确错误信息
- **分页 offset 负数**（BUG-NEW-11）：`listArticlesPaged` 新增 `page = Math.max(1, page)` 防护，避免 page < 1 导致 offset 为负
- **deleteArticle 级联不完整**（BUG-NEW-12）：删除文章时同步清理配图记录和请求记录，新增 `CdcArticleImageMapper` 和 `CdcArticleRequestMapper.deleteById` 支持

### 修复（前端）

- **Workbench 错误提示**（FE-1 + FE-5）：所有 API 调用的 catch 块增加 `toast.error()` 用户提示，confirmOutline/saveDraft 包装独立 try-catch 并加 `return` 中断
- **表单校验缺失**（FE-2）：ArticleCreate 四步表单新增逐步校验，缺少必填项时 toast 提示并自动跳转到对应步骤
- **智能解析接入后端**（FE-3）：`handleParse` 改为异步调用 Agent `parse-intent` 接口，失败时降级到本地解析
- **ArticleList 错误提示**（FE-4 + FE-5）：列表加载和删除操作的 catch 块增加 `toast.error()`，删除成功后 `toast.success()` 确认
- **前端 API 扩展**：`article.js` 新增 `parseIntent()` 函数，支持自由文本智能解析

### 新增

- **全局异常处理器**：`GlobalExceptionHandler.java`（`@RestControllerAdvice`）统一拦截 `RuntimeException`、JSON 解析错误、参数校验异常，包装为 `Result<>` 格式返回，前端可正常通过 `res.code` 判断并弹出 toast 提示

### 变更

- `CdcArticleModificationMapper` 新增 `updateById` 方法及对应 MyBatis XML
- `CdcArticleRequestMapper` 新增 `deleteById` 方法及对应 MyBatis XML
- `ArticleServiceImpl` 注入 `CdcArticleImageMapper`，用于级联删除配图
- Python Agent `parse-intent` 接口从 query parameter 改为 JSON body

## [1.0.0] - 2026-06-19

### 新增

- **文章创建双模式**：表单模式（下拉选择疾病/疫苗/人群/场景）和自由文本模式
- **AI 大纲生成**：基于知识库检索 + 模板匹配，通过 LangGraph 工作流生成结构化大纲
- **AI 正文生成**：融合检索知识、`{ref:N}` 引用标记、字数控制、规则约束
- **自动事实核查**：逐句比对权威知识片段，不合格自动反思修正（最多 3 轮）
- **知识库管理**：疾病/疫苗/人群/场景四大实体 CRUD，含知识片段、生成规则、实体关系
- **向量检索**：DashScope text-embedding-v2，支持预计算向量快速路径和实时 embedding 降级路径
- **LLM 多模型池**：前端可视化管理三类模型配置（文本生成/向量嵌入/图片生成），运行时动态加载
- **三层配置级联**：数据库 → 类型回退 → .env 默认值
- **文章模板系统**：6 个预置模板（标准科普、问答式、拟人叙事、比喻故事、月度清单、通知公告）
- **修改历史追溯**：每次 AI 生成和人工编辑记录变更，支持一键回退
- **Agent 执行追踪**：记录每个 Skill 节点的执行耗时、模型、token 用量
- **配图生成**：分析文章段落识别配图位置，调用多模态 API 生成插图
- **图片库管理**：配图查看、放大预览、插入文章、说明编辑
- **Markdown 导出**：清理引用标记和转义字符，下载 `.md` 文件
- **文章预览**：Modal 弹窗内 Markdown 实时渲染预览
- **暗色模式**：CSS 变量驱动的全局暗色主题切换
- **Docker 一键部署**：5 服务编排（MySQL/Backend/Agent/Frontend/Nginx），健康检查，自动依赖排序
- **安全配置外部化**：所有敏感值通过环境变量注入，.gitignore 排除 .env 文件
- **Nginx 反向代理**：统一入口，按路径分发到各服务，SSE/WebSocket 支持，Gzip 压缩
- **MySQL 自定义配置**：UTF-8 字符集、中国时区、InnoDB 优化
