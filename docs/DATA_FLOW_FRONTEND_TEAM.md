# 数据流转文档

> **节点命名说明**：本文件按 graph 节点名引用节点；4 个节点的注册名（`SkillRegistry.get_skill()` 用的 `name` 属性）与 graph 节点名不一致，详见 [ARCHITECTURE.md "已注册节点清单"](../ARCHITECTURE.md)。

本文档以一个具体场景为例，走一遍从用户输入到文章生成的完整数据链路。

## 场景示例

用户在前端选择「HPV 疫苗」+「女性」+「接种场景」+「标准科普讲解」模板，要求生成一篇 800 字的文章。

## 第一步：前端创建文章

**页面：** ArticleCreate → 选择表单模式

前端调用创建接口：

```http
POST /api/article/generate
{
  "mode": 1,
  "entityType": 2,
  "entityId": 3,
  "populationId": 10001,
  "sceneId": 11001,
  "templateId": 1,
  "wordCount": 800
}
```

**Java 后端处理：**

1. `ArticleGenerateController.generate()` 接收请求
2. `CdcArticleRequestServiceImpl` 将请求参数保存到 `cdc_article_request` 表
3. `ArticleServiceImpl` 创建空文章记录到 `cdc_article` 表，status=1
4. 返回 `ArticleCreateResult`（含 articleId 和上下文信息）

前端拿到 articleId 后跳转到工作台页面 `/article/{id}`。

## 第二步：加载文章上下文

工作台页面加载时调用：

```http
GET /api/article/context/{articleId}
```

**Java 后端查询 5 张表构建上下文：**

```text
cdc_article_request  → 获取创建参数（entity_id=3, population_id=10001, ...）
     │
     ├─→ wiki_entity WHERE id=3         → HPV疫苗实体详情（std_name, alias, summary）
     ├─→ wiki_entity WHERE id=10001     → 女性人群实体详情
     ├─→ wiki_entity WHERE id=11001     → 接种场景实体详情
     │
     ├─→ wiki_segment WHERE entity_id=3
     │     → 获取 HPV疫苗 相关的所有知识片段（约 15-30 条）
     │
     ├─→ wiki_segment_embedding WHERE entity_id=3
     │     → 获取这些片段的预计算向量（1536 维 float32 数组）
     │
     ├─→ wiki_rule WHERE entity_id=3
     │     → 获取生成规则（约 8 条：5 条 MustInclude + 3 条 MustNotSay）
     │
     ├─→ wiki_relation WHERE from_eid=3
     │     → 获取关联实体（如：HPV病毒、宫颈癌等）
     │
     └─→ cdc_article_template WHERE id=1
           → 获取模板（template_name, purpose, tone, outline_structure）
```

这些数据被组装成 `WikiTemplateContext`，包含 entity、segments（含 embeddings）、rules、relations、template，传给前端。

## 第三步：生成大纲

用户在工作台点击「生成大纲」：

```http
POST /api/article/{id}/generate-outline
```

**Java 后端：**

1. `ArticleServiceImpl.generateOutline()` 查询文章和上下文
2. 构造 `AgentRequest`：

```json
{
  "article_id": 1,
  "step": "outline",
  "mode": 1,
  "entity_name": "HPV疫苗",
  "entity_type": "vaccine",
  "population_name": "女性",
  "scene_name": "接种",
  "template_name": "标准科普讲解",
  "template_purpose": "向普通公众解释...",
  "template_tone": "专业但温和",
  "template_outline": "# 一、概述\n## 二、...",
  "word_count": 800,
  "wiki_segments": [
    { "id": 101, "content": "HPV疫苗可预防...", "embedding": [0.012, -0.034, ...] },
    { "id": 102, "content": "接种年龄建议...", "embedding": [0.056, 0.023, ...] },
    ...
  ],
  "wiki_rule": {
    "must_include": ["疫苗有效性", "接种年龄", "不良反应"],
    "must_not_say": ["绝对安全", "没有副作用"]
  },
  "related_entity_names": ["HPV病毒", "宫颈癌"]
}
```

3. `AgentClient` 通过 HTTP POST 将请求发送给 Python Agent：`POST http://agent:8001/api/agent/generate`

## 第四步：Agent LangGraph 工作流执行

Agent 收到 `step="outline"`，启动 **outline_workflow**。

### 4.1 意图解析节点

`should_parse_intent` 判断：`mode=1` 且有结构化参数 → **跳过意图解析**（表单模式不需要）。

### 4.2 输入压缩节点

`CompressSkill` 检查 `user_text`（表单模式下为空）→ 跳过。

### 4.3 实体提取节点

`EntityFetchSkill` 从 state 提取主实体：

```python
main_wiki_entity = {
  "id": 3,
  "entity_type": "vaccine",
  "std_name": "HPV疫苗",
  "alias": ["人乳头瘤病毒疫苗"],
  "summary": "预防 HPV 感染及相关疾病的疫苗..."
}
```

`RelationFetchSkill` 提取关联实体：`["HPV病毒", "宫颈癌"]`。

### 4.4 领域路由节点

`route_by_entity_type` 判断：`entity_type="vaccine"` → 进入 **vaccine_preprocess** 路径。

vaccine_preprocess 注入疫苗领域规则：
- `must_include` 追加 "接种建议或注意事项"
- `must_not_say` 追加 "绝对安全"、"没有任何副作用"

### 4.5 写作技法规划节点

`SkillPlannerSkill` 根据实体类型、用户输入等信息，通过 LLM 自动规划写作方案：

1. 从 `skill_index.yaml` 读取可用的文章类型、受众画像和技法列表
2. 构建 prompt 让 LLM 选择最匹配的文章类型（如 `vaccine_guide`）、受众画像（如 `general_public`）和最多 5 个写作技法
3. 验证分类结果的有效性，无效时降级为默认值
4. 通过 `SkillLoader` 预加载 Layer 2-5 的写作知识内容（蓝图、画像、技法卡片、质量基准）
5. 将完整的 `skill_plan`（含预加载内容）写入 state

### 4.6 知识检索节点（并行）

两个节点并行执行：

**segment_filter 节点：** `VectorStore.search_with_embeddings()` 执行向量检索：
1. 对查询文本（entity_name + population + scene）调用 DashScope embedding API → 得到 1 个查询向量
2. 遍历所有 `wiki_segments`（已携带预计算 embedding），计算余弦相似度
3. 按相似度降序排列，取 top_k=10 个最相关的知识片段
4. 总计只用了 **1 次 API 调用**

**template_load 节点：** `TemplateExtractSkill` 规范化模板元数据。

### 4.7 知识压缩节点

`CompressSkill`（semantic 模式）对检索到的知识片段做中位数距离过滤，保留距离 ≥ 中位数的片段（最多 8 条），去除冗余内容，减少后续 LLM 调用的 token 消耗。

### 4.8 大纲生成节点

`OutlineGenerateSkill` 通过 `build_outline_prompt(state)` 动态组装 Prompt，注入 Layer 1-3 写作知识（通用规则 + 文章类型蓝图 + 受众画像），并调用 LLM：

```json
角色：你是疾控中心的健康科普专家。
任务：根据以下信息生成一篇科普文章的大纲。

模板：标准科普讲解
主题：HPV疫苗
人群：女性
场景：接种
语气：专业但温和

必须包含的知识点：
1. 疫苗有效性
2. 接种年龄
3. 不良反应
4. 接种建议或注意事项

禁止出现的表述：
1. 绝对安全
2. 没有任何副作用

参考知识片段：
[知识1] HPV疫苗可预防...
[知识2] 接种年龄建议...
...

请生成结构化的中文大纲...
```

LLM 返回后，将大纲内容写入 state 的 `article_outline` 字段。

### 4.9 大纲校验节点

`OutlineValidateSkill` 通过 LLM 对生成的大纲进行质量校验：

1. 检查大纲是否覆盖所有 `must_include` 要点
2. 验证蓝图（blueprint）中定义的必需章节是否齐全
3. 评估章节的逻辑顺序是否合理
4. 输出 `outline_valid`（布尔值）和 `outline_feedback`（详细反馈）

如果校验不通过，`OutlineRegenerateSkill` 会根据反馈重新生成大纲。

## 第五步：结果回传

Agent 将执行结果打包为 `AgentResponse` 返回给 Java 后端：

```json
{
  "content": "# 一、什么是HPV疫苗\n## 1.1 HPV病毒简介\n...",
  "quality_metrics": null,
  "trace": [
    { "step": "entity_extract", "duration_ms": 5 },
    { "step": "wiki_retrieve", "duration_ms": 1200 },
    { "step": "template_load", "duration_ms": 3 },
    { "step": "compress_knowledge", "duration_ms": 800 },
    { "step": "outline_generate", "duration_ms": 3500 }
  ],
  "token_usage": {
    "prompt_tokens": 2500,
    "completion_tokens": 600,
    "total_tokens": 3100
  }
}
```

**Java 后端处理：**

1. 将大纲内容保存到 `cdc_article.outline`
2. 更新 `cdc_article.status = 2`
3. 将执行追踪保存到 `cdc_agent_trace` 表（每个 trace entry 一行）
4. 返回大纲内容给前端

## 第六步：生成正文（draft_workflow）

用户确认大纲后点击「生成正文」，流程类似但走 **draft_workflow**：

```text
大纲通过校验 → FusionGenerateSkill（动态 prompt 融合生成）
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
     FactCheck  RuleCheck  StyleCheck
     （事实核查）（规则校验）（文风评估）
         │         │         │
         └─────────┴─────────┘
                   │
            QualityGate（统一路由）
                   │
      ┌──[全部通过]──────────┐
      │                       │
      ▼                       ▼
  PolishSkill            事实失败 → ReflectIterateSkill → 重新生成
  （文笔润色）           规则失败 → RuleReflectSkill → 重新生成
      │                  重试超限 → 强制结束
      ▼
   finalize → 返回正文
```

正文生成的 Prompt 通过 `build_fusion_prompt(state)` 动态组装，注入 Layer 1-4 写作知识：
- Layer 1 通用写作规范（始终注入）
- Layer 2 文章类型蓝图（按 SkillPlanner 分类的类型注入）
- Layer 3 受众画像（按匹配的受众注入）
- Layer 4 写作技法指引（按选择的技法批量注入）
- `template_tone` 作为语气基底，结合受众画像微调
- 引用权威知识片段并插入 `{ref:N}` 标记
- 覆盖所有 must_include 知识点
- 避免 must_not_say 表述
- 控制在指定字数左右

三路并行质量检查：

**FactCheckSkill** 逐句比对正文与权威知识片段，标记不一致的句子，同时验证 `{ref:N}` 引用标注的准确性。

**RuleCheckSkill** 校验 must_include 覆盖和 must_not_say 规避，输出详细的 `rule_check_report`（JSON 格式含 missing_points 和 violated_rules）。

**StyleCheckSkill** 评估可读性 6 维指标：平均句长、被动语态比例、专业术语密度、段落长度、标题层级、过渡词使用，输出 `style_score`（0-1）。

`quality_gate` 统一路由函数读取三路检查结果，决策下一步：全部通过进入文笔润色（PolishSkill），事实失败进入反思迭代（ReflectIterateSkill，只重写错误句子，保留 `{ref:N}` 标注），规则失败进入规则修正（RuleReflectSkill，补充缺失要点 / 删除违规表述），重试超过 3 次则强制结束。

**PolishSkill** 在质量门控通过后执行文笔润色：平滑段落过渡、消除重复表述、统一全文语气，同时严格保留事实准确性和 `{ref:N}` 引用标注。

## 第七步：编辑与确认

用户在工作台中可以：

- **编辑大纲/正文** → `PUT /api/article/{id}/outline` 或 `draft` → 自动记录到 `cdc_article_modification`
- **重新生成** → `POST /api/article/{id}/regenerate-draft` → 旧版本保留在修改历史
- **回退** → `POST /api/article/{id}/revert` → 恢复到任意历史版本
- **确认终稿** → `POST /api/article/{id}/confirm-draft` → status 变为 4
- **导出 Markdown** → 前端本地处理，清理 `{ref:N}` 标记和转义字符，下载 `.md` 文件
- **删除文章** → `DELETE /api/article/{id}` → 级联清理配图（cdc_article_image）+ 修改历史（cdc_article_modification）+ Agent 轨迹（cdc_agent_trace）+ 请求记录（cdc_article_request）+ 文章本身（cdc_article）

## 表关系总结

```text
用户操作
  │
  ▼
cdc_article_request (保存创建参数)
  │
  ├─→ wiki_entity (查实体)
  │     ├─→ wiki_segment (查知识片段)
  │     │     └─→ wiki_segment_embedding (查向量)
  │     ├─→ wiki_rule (查生成规则)
  │     └─→ wiki_relation (查关联实体)
  │
  ├─→ cdc_article_template (查模板)
  │
  ▼
cdc_article (文章记录，status 1→2→3→4)
  │
  ├─→ cdc_article_modification (每次变更记录)
  ├─→ cdc_agent_trace (Agent 执行追踪)
  ├─→ cdc_article_image (配图)
  ├─→ cdc_agent_feedback (用户编辑反馈)
  └─→ cdc_article_request (创建参数，删除文章时级联清理)
```
