# 系统架构设计

本文档描述 CDC 科普文章智能生成平台的整体架构、核心模块设计和技术决策。面向参与开发的工程师。

## 整体架构

系统采用三服务分离架构，通过 Nginx 反向代理对外暴露统一入口：

```text
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

**Agent（FastAPI + LangGraph）** 是 AI 生成引擎，提供 6 个端点。负责意图解析、向量检索、写作技法规划、大纲生成与校验、正文生成、三路并行质量检查（事实核查 + 规则校验 + 文风评估）、反思迭代、规则修正、文笔润色和图片生成。核心是一个 LangGraph 状态机，编排 17 个 Skill 节点构成生成流水线，并集成了 6 层渐进式披露的写作知识体系。

### 服务间通信

- **前端 → 后端**：所有 `/api/*` 请求（Agent/Skill 除外）经 Nginx 转发到 Backend :8080
- **前端 → Agent**：`/api/agent/*` 和 `/api/skill/*` 请求经 Nginx 转发到 Agent :8001
- **后端 → Agent**：Backend 通过 `AgentClient`（httpx/RestTemplate）同步调用 Agent 的生成端点
- **Agent → 后端**：Agent 通过 `ConfigManager` 调用 Backend API 获取 LLM 配置（`GET /api/llm-config/default/{type}`）
- **Agent → DashScope**：LLM 文本生成、向量嵌入、图片生成均通过 OpenAI 兼容 REST API 调用

## LangGraph 工作流引擎

Agent 的核心是两条 LangGraph 编译工作流，共享同一个状态对象 `AgentState`。

### 大纲工作流（outline_workflow）

```json
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
                                  ▼
                        SkillPlannerSkill
                     （文章类型分类 + 受众匹配
                       + 技法选择 + 知识预加载）
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
                    （动态 prompt + Skill 知识注入）
                                  │
                                  ▼
                        OutlineValidateSkill
                         （大纲结构校验）
                                  │
                       ┌──[通过]──┴──[不通过]──┐
                       ▼                       ▼
                    [END]            OutlineRegenerateSkill
                                            │
                                            ▼
                                       [END]
```

### 正文工作流（draft_workflow）

在大纲工作流基础上延伸：

```json
OutlineGenerateSkill 完成
          │
          ▼
  OutlineValidateSkill（大纲校验）
          │
  ┌──[通过]──┴──[不通过]──┐
  │                       │
  ▼                       ▼
FusionGenerateSkill    OutlineRegenerateSkill
（动态 prompt 生成）       │
  │                     [END]
  │
  ├────────────┬────────────┐
  ▼            ▼            ▼
FactCheck   RuleCheck   StyleCheck
（事实核查） （规则校验） （文风评估）
  │            │            │
  └────────────┴────────────┘
               │
         QualityGate（统一路由）
               │
  ┌──[全部通过]──────────┐
  │                       │
  ▼                       ▼
PolishSkill         ┌─[事实失败]─→ ReflectIterateSkill
（文笔润色）        │                    │
  │                 │              retry < 3?
  ▼                 │              ├─ 是 → 回到 FusionGenerate
finalize            │              └─ 否 → finalize → [END]
  │                 │
[END]               ├─[规则失败]─→ RuleReflectSkill
                    │              （补充缺失要点/删除违规表述）
                    │                    │
                    │                    ▼
                    │              回到 FusionGenerate
                    │
                    └─[重试超限]─→ finalize → [END]
```

### 条件路由

| 路由函数 | 判断逻辑 |
|----------|----------|
| `should_parse_intent` | `mode == 1` 且 `user_text` 为空 → 跳过意图解析（表单模式）；否则执行意图解析（文本模式） |
| `route_by_entity_type` | `disease/epidemic/1` → 疫情路径；`vaccine/drug/2` → 疫苗路径；其他 → 通用路径 |
| `should_validate_outline` | `outline_valid == true` → 大纲通过；否则 → 大纲重新生成 |
| `quality_gate` | 三路并行校验后统一路由：`is_fact_ok && rule_passed` → 进入润色（polish）；`retry_times >= 3` → 强制结束（finalize）；事实失败 → 反思迭代（reflect）；规则失败 → 规则修正（rule_reflect） |

## 节点体系

> **术语约定**：LangGraph 工作流里的执行单元统称**节点（node）**；`app/skills/writing/` 下的 6 层渐进式披露的写作知识体系才是项目里的 **Skill**（写作经验包）。`app/skills/flow/` 与 `app/skills/wiki/` 下的执行单元虽然 Python 类名带 `Skill` 后缀，但语义上是"被节点调用的具体能力"——它们的调用方是节点，不是 Skill。
>
> 注册方式：所有 17 个执行能力通过 `BaseSkill` 抽象类实现，由 `SkillRegistry` 单例统一注册；LangGraph 节点通过 `SkillRegistry.get_skill(name).execute(state)` 调用。下文统称"已注册节点"。

### 设计原则

所有已注册节点继承 `BaseSkill` 抽象类，遵循四个原则：单一职责（每个节点只做一件事）、纯函数（不修改输入 state，返回新 state）、标准化 I/O（统一的 `Dict[str, Any]` 状态包）、独立可测（每个节点可单独运行测试）。

### 已注册节点清单（17 个）

> 三个名字必须区分清楚，全部来自代码、都不动：
> - **类名**（`XxxSkill`）—— Python 实现类，定义在 `app/skills/flow/*.py` 和 `app/skills/wiki/*.py`
> - **注册名**（类里 `name` 属性的返回值）—— `SkillRegistry.register(...)` 用它建索引，`SkillRegistry.get_skill("xxx")` 也按它查
> - **graph 节点名**（`graph.add_node("xxx", ...)` 的第一个参数）—— LangGraph 工作流图里的节点 key
>
> 多数情况下注册名 = graph 节点名；只有 4 个不一致，下表把三列都列出来便于一眼对照。

**规划类（planning）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `skill_planner` | `skill_planner` | `SkillPlannerSkill` | 分类文章类型、匹配受众画像、选择写作技法、预加载 Layer 2-5 知识 | 是 |

**解析类（parsing）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `intent_parse` | `intent_parse` | `IntentParseSkill` | 从自由文本提取实体类型、实体名、人群、场景、字数 | 是 |
| `compress` | `compress_input` | `CompressSkill` | 压缩用户输入以减少 token 消耗，支持无损/语义两种模式 | 是 |

**检索类（retrieval）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `entity_fetch` | `entity_extract` | `EntityFetchSkill` | 提取主实体详细信息（纯数据转换） | 否 |
| `relation_fetch` | `wiki_relation` | `RelationFetchSkill` | 提取关联实体信息（纯数据转换） | 否 |
| `template_extract` | `template_load` | `TemplateExtractSkill` | 规范化模板元数据（纯数据转换） | 否 |

**生成类（generation）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `outline_generate` | `outline_generate` | `OutlineGenerateSkill` | 基于模板 + 知识片段 + 规则 + 写作体系生成文章大纲（动态 prompt） | 是 |
| `fusion_generate` | `fusion_generate` | `FusionGenerateSkill` | 融合大纲、知识、规则、写作体系生成完整正文，带 `{ref:N}` 引用标记（动态 prompt） | 是 |

**校验类（validation）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `outline_validate` | `outline_validate` | `OutlineValidateSkill` | 校验大纲结构完整性、must_include 覆盖、蓝图必需章节 | 是 |
| `fact_check` | `fact_check` | `FactCheckSkill` | 逐句比对权威知识片段，验证事实准确性和引用标注 | 是 |
| `rule_check` | `rule_check` | `RuleCheckSkill` | 校验 must_include 覆盖和 must_not_say 规避，输出详细报告 | 是 |
| `style_check` | `style_check` | `StyleCheckSkill` | 评估可读性（句长、被动语态、专业术语密度等 6 维），输出 style_score | 是 |

**迭代类（iteration）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `reflect_iterate` | `reflect_iterate` | `ReflectIterateSkill` | 根据事实核查报告局部修正错误句子，保留 `{ref:N}` 标注，最多重试 3 次 | 是 |
| `rule_reflect` | `rule_reflect` | `RuleReflectSkill` | 根据规则检查报告补充缺失要点、删除违规表述 | 是 |

**润色类（polish）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `polish` | `polish` | `PolishSkill` | 平滑过渡、消除冗余、统一语气，保留事实和 `{ref:N}` 标注 | 是 |

**图片类（image，不进入 LangGraph graph，仅供 `/api/agent/generate-images` 端点调用）：**

| 注册名 | graph 节点名 | 实现类 | 功能 | 调用 LLM |
|---|---|---|---|---|
| `section_analyze` | — | `SectionAnalyzeSkill` | 分析正文段落，标记需要配图的位置 | 是 |
| `image_generate` | — | `ImageGenerateSkill` | 调用多模态 API 生成配图并下载到本地 | 是（图片模型） |

## 写作知识体系（Writing Skill System）

Agent 集成了 6 层渐进式披露的写作知识体系（这是项目里**真正叫 Skill 的部分**），由 `skill_planner` 节点（`SkillPlannerSkill` 实现类）和 `SkillLoader` 协作实现。LLM 在生成大纲和正文时，不再使用固定的 prompt 模板，而是根据文章类型、受众和技法动态注入对应层级的写作知识。

### 层级结构

```text
Layer 0: skill_index.yaml（元索引）
  │  列出所有文章类型、受众画像、技法卡片的代码和文件路径
  │
Layer 1: universal_rules.md（通用规则，始终加载）
  │  CDC 科普文基线规范、微信平台规范、安全红线、引用标准
  │
Layer 2: blueprints/{type}.md（文章类型蓝图，按类型加载）
  │  6 种类型：disease_explainer / vaccine_guide / outbreak_alert
  │           myth_buster / seasonal_health / case_story
  │
Layer 3: audiences/{audience}.md（受众画像，按受众加载）
  │  5 种受众：general_public / parents / elderly / students / healthcare_workers
  │
Layer 4: techniques/{code}.md（技法卡片，按选择批量加载）
  │  8 种技法：hook_opening / data_presentation / analogy_explanation
  │           myth_bust_pattern / cta_closing / emotion_writing / faq_pattern / wechat_formatting
  │
Layer 5: quality/{type}.md（质量基准，按类型加载）
     40 分制评分细则，供 StyleCheckSkill 和 QualityGate 参考
```

### 工作机制

`SkillPlannerSkill` 将 Layer 0 索引中的类型描述、受众列表和技法列表构建为 prompt，由 LLM 自动分类文章类型、匹配受众、选择最多 5 个技法。分类结果经验证后，`SkillLoader` 预加载 Layer 2-5 对应文件内容并缓存到 `state["skill_plan"]` 中。

后续 `OutlineGenerateSkill` 和 `FusionGenerateSkill` 通过 `build_outline_prompt(state)` 和 `build_fusion_prompt(state)` 动态组装 prompt，将 Layer 1-4 的知识内容注入到 LLM 调用中。语气以 `template_tone` 为基底，结合受众画像做微调。

### 目录结构

```text
app/skills/writing/
├── skill_index.yaml          # Layer 0: 元索引
├── universal_rules.md        # Layer 1: 通用规则
├── blueprints/               # Layer 2: 文章类型蓝图
│   ├── disease_explainer.md
│   ├── vaccine_guide.md
│   ├── outbreak_alert.md
│   ├── myth_buster.md
│   ├── seasonal_health.md
│   └── case_story.md
├── audiences/                # Layer 3: 受众画像
│   ├── general_public.md
│   ├── parents.md
│   ├── elderly.md
│   ├── students.md
│   └── healthcare_workers.md
├── techniques/               # Layer 4: 技法卡片
│   ├── hook_opening.md
│   ├── data_presentation.md
│   ├── analogy_explanation.md
│   ├── myth_bust_pattern.md
│   ├── cta_closing.md
│   ├── emotion_writing.md
│   ├── faq_pattern.md
│   └── wechat_formatting.md
├── quality/                  # Layer 5: 质量基准
│   ├── disease_explainer.md
│   ├── vaccine_guide.md
│   ├── outbreak_alert.md
│   ├── myth_buster.md
│   ├── seasonal_health.md
│   └── case_story.md
└── skill_loader.py           # 单例加载器，按层级读取并缓存
```

## LLM 多模型池

Agent 采用三层级联配置机制，运行时动态选择模型：

```text
优先级 1：Java 数据库配置（cdc_llm_config 表）
    ↓ 未找到
优先级 2：文本子类型回退（fact_check → text_generation）
    ↓ 未找到
优先级 3：本地 .env 默认值
```

三种模型类型通过 `config_type` 区分：`text_generation`（文本生成）、`embedding`（向量嵌入）、`image_generation`（图片生成）。用户可在前端「LLM 配置」页面可视化管理，修改后 60 秒内自动生效，无需重启。

`LLMClientPool` 是全局单例，按 `config_type` 缓存 `LLMClient` 实例，内置 60 秒 TTL 自动过期和配置变更检测（model/apiKey/baseUrl 三元组比对，发现变更时自动重建客户端）。每个 `LLMClient` 使用 `httpx` 异步调用 OpenAI 兼容 API，内置信号量控制（并发上限 5）、指数退避重试（3 次）和中文错误信息翻译。

## 向量检索

知识库检索采用 DashScope `text-embedding-v2` 模型生成 1536 维向量，支持两种检索模式：

**快速路径（推荐）**：Java 后端预先从 `wiki_segment_embedding` 表加载已计算的向量，随请求一并传给 Agent。Agent 只需对查询文本做 1 次 embedding 调用，然后与所有片段向量做余弦相似度计算。总计 1 次 API 调用。

**降级路径**：如果片段没有预计算向量，Agent 对所有片段文本批量调用 embedding API。总计 N+1 次 API 调用。

`VectorStore` 类封装了两种模式的自动检测和切换逻辑。

## 数据库设计

### ER 关系图

```text
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

```http
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
