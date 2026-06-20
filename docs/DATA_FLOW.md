# 数据流转文档

本文档以一个具体场景为例，走一遍从用户输入到文章生成的完整数据链路。

## 场景示例

用户在前端选择「HPV 疫苗」+「女性」+「接种场景」+「标准科普讲解」模板，要求生成一篇 800 字的文章。

## 第一步：前端创建文章

**页面：** ArticleCreate → 选择表单模式

前端调用创建接口：

```
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

```
GET /api/article/context/{articleId}
```

**Java 后端查询 5 张表构建上下文：**

```
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

```
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

### 4.5 知识检索节点（并行）

两个节点并行执行：

**segment_filter 节点：** `VectorStore.search_with_embeddings()` 执行向量检索：
1. 对查询文本（entity_name + population + scene）调用 DashScope embedding API → 得到 1 个查询向量
2. 遍历所有 `wiki_segments`（已携带预计算 embedding），计算余弦相似度
3. 按相似度降序排列，取 top_k=10 个最相关的知识片段
4. 总计只用了 **1 次 API 调用**

**template_load 节点：** `TemplateExtractSkill` 规范化模板元数据。

### 4.6 知识压缩节点

`CompressSkill`（semantic 模式）压缩检索到的知识片段，去除冗余内容，减少后续 LLM 调用的 token 消耗。

### 4.7 大纲生成节点

`OutlineGenerateSkill` 构建 Prompt 并调用 LLM：

```
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

```
大纲 → FusionGenerateSkill（融合生成）
         │
   ┌─────┼─────┐
   ▼           ▼
FactCheck    RuleCheck
   │           │
   └─────┬─────┘
         │
    [通过] → 返回正文
    [不通过] → ReflectIterateSkill → 重新生成（最多3轮）
```

正文生成的 Prompt 要求 LLM：
- 按大纲结构展开
- 引用权威知识片段并插入 `{ref:N}` 标记
- 覆盖所有 must_include 知识点
- 避免 must_not_say 表述
- 控制在指定字数左右

事实核查（FactCheckSkill）逐句比对正文与权威知识片段，标记不一致的句子。如果不通过，反思迭代（ReflectIterateSkill）只重写错误句子，保留正确部分。

## 第七步：编辑与确认

用户在工作台中可以：

- **编辑大纲/正文** → `PUT /api/article/{id}/outline` 或 `draft` → 自动记录到 `cdc_article_modification`
- **重新生成** → `POST /api/article/{id}/regenerate-draft` → 旧版本保留在修改历史
- **回退** → `POST /api/article/{id}/revert` → 恢复到任意历史版本
- **确认终稿** → `POST /api/article/{id}/confirm-draft` → status 变为 4
- **导出 Markdown** → 前端本地处理，清理 `{ref:N}` 标记和转义字符，下载 `.md` 文件
- **删除文章** → `DELETE /api/article/{id}` → 级联清理配图（cdc_article_image）+ 修改历史（cdc_article_modification）+ Agent 轨迹（cdc_agent_trace）+ 请求记录（cdc_article_request）+ 文章本身（cdc_article）

## 表关系总结

```
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
