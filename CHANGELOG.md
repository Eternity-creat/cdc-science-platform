# 版本变更记录

本项目的所有重要变更都记录在此文件中。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

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
