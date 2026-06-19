# 系统架构设计

本文档描述 CDC 科普文章智能生成平台的整体架构、核心模块设计和技术决策。面向参与开发的工程师。

## 整体架构

系统采用三服务分离架构，通过 Nginx 反向代理对外暴露统一入口：

```
用户浏览器
    │
    ▼
┌──────────────────────────────────────────────┐
│                Nginx :80                      │
│         统一入口 + 反向代理 + Gzip            │
├──────────────┬──────────────┬────────────────┤
│  /api/agent  │    /api/*    │      /*        │
│  /api/skill  │              │                │
│  /uploads    │              │                │
└──────┬───────┴──────┬───────┴───────┬────────┘
       │              │               │
       ▼              ▼               ▼
 ┌───────────┐  ┌───────────┐  ┌───────────┐
 │  Agent    │  │  Backend  │  │ Frontend  │
 │ FastAPI   │  │ Spring    │  │ React SPA │
 │ LangGraph │  │ Boot      │  │ Nginx     │
 │ :8001     │  │ :8080     │  │ :80       │
 └─────┬─────┘  └─────┬─────┘  └───────────┘
       │              │
       ▼              ▼
 ┌───────────┐  ┌───────────┐
 │ DashScope │  │  MySQL    │
 │ LLM API   │  │  :3306    │
 └───────────┘  └───────────┘
```

### 服务职责

**Frontend（React SPA）** 负责所有用户界面：文章创建向导、工作台编辑、知识库管理、LLM 配置管理、模板管理。使用 shadcn/ui 组件体系，支持暗色模式。通过 Vite 开发代理或 Nginx 反向代理将 API 请求分发到后端和 Agent。

**Backend（Spring Boot）** 是业务逻辑中枢，提供 60 个 REST 端点。负责文章全生命周期管理（创建、编辑、确认、删除）、知识库 CRUD（实体、片段、规则、关系）、模板管理、LLM 配置管理、修改历史追踪和 Agent 执行追踪。所有数据持久化通过 MyBatis 操作 MySQL。

**Agent（FastAPI + LangGraph）** 是 AI 生成引擎，提供 6 个端点。负责意图解析、向量检索、大纲生成、正文生成、事实核查、规则校验、反思迭代和图片生成。核心是一个 LangGraph 状态机，编排 12 个 Skill 节点构成生成流水线。

### 服务间通信

- **前端 → 后端**：所有 `/api/*` 请求（Agent/Skill 除外）经 Nginx 转发到 Backend :8080
- **前端 → Agent**：`/api/agent/*` 和 `/api/skill/*` 请求经 Nginx 转发到 Agent :8001
- **后端 → Agent**：Backend 通过 `AgentClient`（httpx/RestTemplate）同步调用 Agent 的生成端点
- **Agent → 后端**：Agent 通过 `ConfigManager` 调用 Backend API 获取 LLM 配置（`GET /api/llm-config/default/{type}`）
- **Agent → DashScope**：LLM 文本生成、向量嵌入、图片生成均通过 OpenAI 兼容 REST API 调用

## LangGraph 工作流引擎

Agent 的核心是两条 LangGraph 编译工作流，共享同一个状态对象 `AgentState`。

### 大纲工作流（outline_workflow）

```
__start__
  │
  ├─[表单模式]─→ 跳过意图解析 ──────────────┐
  │                                          │
  └─[文本模式]─→ IntentParseSkill ───────────┘
                                               │
                                               ▼
                                    ┌─ CompressSkill（压缩输入）
                                    │
                                    ▼
                              EntityFetchSkill（主实体提取）
                              RelationFetchSkill（关联实体提取）
                                    │
                                    ▼
                          ┌─ 按 entity_type 路由 ─┐
                          │                       │
                    epidemic_preprocess     vaccine_preprocess
                    （注入疫情数据规则）     （注入接种建议规则）
                          │                       │
                          └───────┬───────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼                           ▼
            segment_filter              template_load
          （向量检索 top-K）            （模板加载）
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                         CompressSkill（压缩知识）
                                  │
                                  ▼
                        OutlineGenerateSkill
                                  │
                               [END]
```

### 正文工作流（draft_workflow）

在大纲工作流基础上延伸：

```
OutlineGenerateSkill 完成
          │
          ▼
  FusionGenerateSkill（融合生成正文）
          │
    ┌─────┼─────┐
    ▼           ▼
FactCheck    RuleCheck
（事实核查）  （规则校验）
    │           │
    └─────┬─────┘
          │
    ┌─[全部通过]─→ finalize → [END]
    │
    └─[核查失败]─→ ReflectIterateSkill（反思修正）
                        │
                  retry < 3?
                  ├─ 是 → 回到 FusionGenerateSkill
                  └─ 否 → finalize → [END]
```

### 条件路由

| 路由函数 | 判断逻辑 |
|----------|----------|
| `should_parse_intent` | `mode == 1` 且 `user_text` 为空 → 跳过意图解析（表单模式）；否则执行意图解析（文本模式） |
| `route_by_entity_type` | `disease/epidemic/1` → 疫情路径；`vaccine/drug/2` → 疫苗路径；其他 → 通用路径 |
| `check_fact_result` | `is_fact_ok == true` → 通过；`retry_times >= 3` → 强制结束；否则 → 反思迭代 |

## Skill 系统

### 设计原则

所有 Skill 继承 `BaseSkill` 抽象类，遵循四个原则：单一职责（每个 Skill 只做一件事）、纯函数（不修改输入 state，返回新 state）、标准化 I/O（统一的 `Dict[str, Any]` 状态包）、独立可测（每个 Skill 可单独运行测试）。

### Skill 清单

**解析类（parsing）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `IntentParseSkill` | 从自由文本提取实体类型、实体名、人群、场景、字数 | 是 |
| `CompressSkill` | 压缩用户输入以减少 token 消耗，支持无损/语义两种模式 | 是 |
| `SectionAnalyzeSkill` | 分析正文段落，标记需要配图的位置 | 是 |

**检索类（retrieval）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `EntityFetchSkill` | 提取主实体详细信息（纯数据转换） | 否 |
| `RelationFetchSkill` | 提取关联实体信息（纯数据转换） | 否 |
| `TemplateExtractSkill` | 规范化模板元数据（纯数据转换） | 否 |

**生成类（generation）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `OutlineGenerateSkill` | 基于模板 + 知识片段 + 规则生成文章大纲 | 是 |
| `FusionGenerateSkill` | 融合大纲、知识、规则生成完整正文，带 `{ref:N}` 引用标记 | 是 |

**校验类（validation）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `FactCheckSkill` | 逐句比对权威知识片段，验证事实准确性 | 是 |
| `RuleCheckSkill` | 校验 must_include 覆盖和 must_not_say 规避 | 是 |

**迭代类（iteration）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `ReflectIterateSkill` | 根据核查报告重写错误句子，最多重试 3 次 | 是 |

**图片类（image）：**

| Skill | 功能 | 调用 LLM |
|-------|------|----------|
| `ImageGenerateSkill` | 调用多模态 API 生成配图并下载到本地 | 是（图片模型） |

## LLM 多模型池

Agent 采用三层级联配置机制，运行时动态选择模型：

```
优先级 1：Java 数据库配置（cdc_llm_config 表）
    ↓ 未找到
优先级 2：文本子类型回退（fact_check → text_generation）
    ↓ 未找到
优先级 3：本地 .env 默认值
```

三种模型类型通过 `config_type` 区分：`text_generation`（文本生成）、`embedding`（向量嵌入）、`image_generation`（图片生成）。用户可在前端「LLM 配置」页面可视化管理，修改后立即生效，无需重启。

`LLMClientPool` 是全局单例，按 `config_type` 缓存 `LLMClient` 实例。每个 `LLMClient` 使用 `httpx` 异步调用 OpenAI 兼容 API，内置信号量控制（并发上限 5）、指数退避重试（3 次）和中文错误信息翻译。

## 向量检索

知识库检索采用 DashScope `text-embedding-v2` 模型生成 1536 维向量，支持两种检索模式：

**快速路径（推荐）**：Java 后端预先从 `wiki_segment_embedding` 表加载已计算的向量，随请求一并传给 Agent。Agent 只需对查询文本做 1 次 embedding 调用，然后与所有片段向量做余弦相似度计算。总计 1 次 API 调用。

**降级路径**：如果片段没有预计算向量，Agent 对所有片段文本批量调用 embedding API。总计 N+1 次 API 调用。

`VectorStore` 类封装了两种模式的自动检测和切换逻辑。

## 数据库设计

### ER 关系图

```
                        ┌──────────────────┐
                        │  wiki_entity     │
                        │  (疾病/疫苗/     │
                        │   人群/场景)      │
                        └──────┬───────────┘
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
        │ wiki_segment │ │wiki_rule │ │wiki_relation │
        │ (知识片段)    │ │(生成规则) │ │(实体关系)     │
        └───────┬──────┘ └──────────┘ └──────────────┘
                │
        ┌───────▼───────────┐
        │wiki_segment_      │
        │  embedding        │
        │(向量持久化)        │
        └───────────────────┘

  ┌──────────────────┐       ┌──────────────────┐
  │cdc_article_      │       │cdc_article_      │
  │  request         │──────▶│  template        │
  │(创建请求)         │       │(文章模板)         │
  └────────┬─────────┘       └──────────────────┘
           │
    ┌──────▼──────┐
    │ cdc_article │
    │  (文章主表)  │
    └──────┬──────┘
     ┌─────┼─────┬──────────┐
     │     │     │          │
     ▼     ▼     ▼          ▼
 ┌──────┐┌────┐┌──────┐┌───────┐
 │modifi││imag││trace ││feed-  │
 │cation││e   ││      ││back   │
 └──────┘└────┘└──────┘└───────┘

  ┌──────────────────┐    ┌──────────────────┐
  │ cdc_llm_config   │    │cdc_embedding_    │
  │ (LLM 模型配置)    │    │  cache           │
  └──────────────────┘    └──────────────────┘
```

### 表清单

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `cdc_article` | 文章主表 | outline, initial_draft, final_article, status(1-4) |
| `cdc_article_request` | 创建请求参数 | mode, entity_type, entity_id, user_text |
| `cdc_article_template` | 文章模板 | template_name, purpose, tone, outline_structure |
| `cdc_article_modification` | 修改历史 | before_content, after_content, operation_type |
| `cdc_article_image` | 配图管理 | file_path, caption, position, generation_prompt |
| `cdc_agent_trace` | Agent 执行追踪 | step_name, cost_time, token_usage(JSON) |
| `cdc_agent_feedback` | 用户编辑反馈 | original_text, edited_text, edit_type |
| `cdc_llm_config` | LLM 模型配置 | config_type, model_name, params(JSON), is_default |
| `cdc_embedding_cache` | 通用向量缓存 | content_hash, embedding(JSON) |
| `cdc_upload_task` | 上传任务追踪 | file_name, status, result_msg |
| `wiki_entity` | 知识库实体 | entity_type(1-4), std_name, summary |
| `wiki_segment` | 知识片段 | entity_id, content, source |
| `wiki_segment_embedding` | 向量持久化 | segment_id, embedding(JSON), dimensions(1536) |
| `wiki_rule` | 生成规则 | entity_id, rule_type(MustInclude/MustNotSay/FactRule) |
| `wiki_relation` | 实体关系 | from_eid, to_eid, rel_type |

### 文章状态机

```
status=1 (待生成大纲)
    │  POST /api/article/{id}/generate-outline
    ▼
status=2 (大纲编辑中)
    │  POST /api/article/{id}/confirm-outline
    │  POST /api/article/{id}/generate-draft
    ▼
status=3 (正文编辑中)
    │  POST /api/article/{id}/confirm-draft
    ▼
status=4 (已确认终稿)
```

每个阶段都支持重新生成（regenerate）和回退（revert），所有变更自动记录到 `cdc_article_modification` 表。

## 前端页面架构

| 路由 | 页面 | 功能 |
|------|------|------|
| `/articles` | ArticleList | 文章列表，支持状态筛选、关键词搜索、分页 |
| `/create` | ArticleCreate | 多步创建向导，表单模式（3 步）和文本模式 |
| `/article/:id` | Workbench | 文章编辑工作台，大纲树、正文编辑、AI 追踪、修改历史、配图管理、Markdown 导出 |
| `/wiki` | WikiManagement | 知识库管理，四大实体 CRUD（疾病/疫苗/人群/场景） |
| `/templates` | TemplateManagement | 文章模板管理 |
| `/llm-config` | LlmConfigManagement | LLM 模型配置管理，三类模型卡片式 UI |

所有页面共享 `AppShell` 布局（侧边栏导航 + 暗色模式切换），API 调用通过 `src/api/` 下的 6 个客户端模块统一封装。

## 关键技术决策

**为什么用 LangGraph 而不是纯链式调用？** 正文生成需要条件分支（事实核查不通过时回退重试），LangGraph 原生支持有向图编排和状态持久化，比手写 if-else 更清晰且可扩展。

**为什么向量检索有两条路径？** 知识库有 9000+ 片段，全部实时 embedding 需要大量 API 调用。预计算向量存储在数据库中可以大幅降低延迟，同时保留实时 embedding 作为降级路径保证可用性。

**为什么 LLM 配置存数据库而不是配置文件？** 用户需要在运行时通过前端界面切换模型，无需重启服务。三层级联（数据库 → 类型回退 → .env 默认）兼顾了灵活性和可靠性。

**为什么不用外键约束？** 数据库使用 `SET FOREIGN_KEY_CHECKS = 0`，所有关系是逻辑外键。这降低了批量导入和迁移的复杂度，同时要求应用层保证数据一致性。
