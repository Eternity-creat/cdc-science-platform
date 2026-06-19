# API 参考文档

本文档涵盖所有 REST API 端点。Java 后端提供 60 个端点，Python Agent 提供 6 个端点。

## 通用约定

**响应格式：** 所有 Java 后端端点返回统一的 `Result<T>` 信封：

```json
{
  "code": 200,
  "msg": "success",
  "data": T
}
```

分页端点返回 `Result<PageResult<T>>`，`PageResult` 包含 `list`、`total`、`page`、`size` 字段。

**Agent 响应格式：** Agent 端点直接返回业务对象（非 Result 信封）。

**路径 ID 优先：** 所有 `PUT /{id}` 端点中，路径参数 `id` 覆盖请求体中的 `id` 字段。

---

## 文章管理

### 文章列表

```
GET /api/article/list
```
返回所有文章（含模板名、实体名、修改次数）。

```
GET /api/article/list/paged?page=1&size=10&status=2&keyword=疫苗
```
分页列表，支持按状态和关键词筛选。status: 1=待大纲, 2=大纲编辑, 3=正文编辑, 4=已确认。

### 文章详情

```
GET /api/article/{id}
```
返回单个文章完整信息，含 outline、initial_draft、final_article 等字段。

### 创建文章（表单模式）

```
POST /api/article/generate
Content-Type: application/json

{
  "mode": 1,
  "entityType": 1,
  "entityId": 45,
  "populationId": 10001,
  "sceneId": 11001,
  "templateId": 1,
  "wordCount": 800
}
```
保存表单参数，创建空文章，返回 `{ articleId, context }`。

### 创建文章（文本模式）

```
POST /api/article/generate/text
Content-Type: application/json

{
  "userText": "写一篇关于HPV疫苗女性接种的科普文章",
  "templateId": 1
}
```
解析自由文本意图，创建文章。

### 获取表单下拉数据

```
GET /api/article/form/dropdown
```
返回创建表单所需的下拉选项：疾病列表、疫苗列表、人群列表、场景列表、模板列表。

### AI 生成大纲

```
POST /api/article/{id}/generate-outline
```
调用 Agent 生成文章大纲。文章 status 从 1 变为 2。返回生成的大纲内容。

### AI 生成正文

```
POST /api/article/{id}/generate-draft
```
调用 Agent 基于大纲生成正文。文章 status 从 2 变为 3。返回生成的正文内容。

### 保存大纲

```
PUT /api/article/{id}/outline
Content-Type: text/plain

# 一、概述
## 1.1 什么是HPV
...
```
保存编辑后的大纲，自动记录修改历史（operation_type = `manual_edit`）。

### 保存正文

```
PUT /api/article/{id}/draft
Content-Type: text/plain

正文内容...
```
保存编辑后的正文，自动记录修改历史。

### 确认大纲

```
POST /api/article/{id}/confirm-outline
```
确认大纲，可附带最终内容。状态保持 2，可继续生成正文。

### 确认正文

```
POST /api/article/{id}/confirm-draft
```
确认正文为终稿。文章 status 从 3 变为 4。

### 重新生成大纲

```
POST /api/article/{id}/regenerate-outline
```
重新生成大纲，旧版本保留在修改历史中。

### 重新生成正文

```
POST /api/article/{id}/regenerate-draft
```
重新生成正文，旧版本保留在修改历史中。

### 自动保存

```
POST /api/article/{id}/autosave
Content-Type: application/json

{
  "field": "outline",
  "content": "大纲内容..."
}
```
轻量自动保存，不记录修改历史。field 可选 `outline` 或 `initial_draft`。

### 回退到历史版本

```
POST /api/article/{id}/revert
Content-Type: application/json

{
  "modificationId": 42
}
```
将文章回退到指定修改历史版本。

### 修改历史

```
GET /api/article/{id}/modifications
```
返回文章的所有修改记录，含 before_content、after_content、operation_type（manual_edit / ai_generate / ai_regenerate / revert）。

### Agent 执行追踪

```
GET /api/article/{id}/trace
```
返回 Agent 生成该文章时的执行追踪，含每个步骤的名称、耗时、模型、token 用量。

### 删除文章

```
DELETE /api/article/{id}
```
级联删除文章及其修改历史、执行追踪。

### 文章上下文

```
GET /api/article/context/{id}
```
返回文章生成上下文（实体、知识片段、规则等）。

### 创建记录

```
GET /api/article/record/{id}
GET /api/article/record/list
```
查询表单提交记录。

---

## 配图管理

### 获取文章配图列表

```
GET /api/article-image/article/{articleId}
```

### 获取单张图片

```
GET /api/article-image/{id}
```

### 保存配图

```
POST /api/article-image
Content-Type: application/json

{
  "articleId": 1,
  "imageKey": "img_001",
  "filePath": "/uploads/images/xxx.jpg",
  "caption": "HPV病毒结构示意图",
  "position": 3,
  "generatedBy": "qwen-image-2.0-pro"
}
```

### 批量保存配图

```
POST /api/article-image/batch
Content-Type: application/json

[{ "articleId": 1, "imageKey": "img_001", ... }, ...]
```

### 更新配图

```
PUT /api/article-image/{id}
Content-Type: application/json
```

### 更新配图说明

```
PUT /api/article-image/{id}/caption
Content-Type: application/json

{ "caption": "新的图片说明" }
```

### 删除配图

```
DELETE /api/article-image/{id}
```

---

## 知识库管理

### 实体 CRUD

```
GET  /api/wiki/list                              # 所有实体（含详情 DTO）
GET  /api/wiki/list/paged?page=1&size=15&type=1  # 分页，type: 1=疾病 2=疫苗 3=人群 4=场景
GET  /api/wiki/{id}                               # 单个实体详情
POST /api/wiki                                    # 创建实体
PUT  /api/wiki/{id}                               # 更新实体
DELETE /api/wiki/{id}                              # 删除实体
```

**WikiEntity 请求体：**
```json
{
  "entityType": 1,
  "stdName": "流行性感冒",
  "alias": "[\"流感\",\"季节性流感\"]",
  "summary": "由流感病毒引起的急性呼吸道传染病..."
}
```

### 知识片段 CRUD

```
POST /api/wiki/segment              # 创建片段
PUT  /api/wiki/segment/{id}         # 更新片段
DELETE /api/wiki/segment/{id}        # 删除片段
GET  /api/wiki/entity/{entityId}/segments-with-embeddings  # 获取实体所有片段及预计算向量
```

### 生成规则 CRUD

```
POST /api/wiki/rule                 # 创建规则
PUT  /api/wiki/rule/{id}            # 更新规则
DELETE /api/wiki/rule/{id}           # 删除规则
```

**WikiRule 请求体：**
```json
{
  "entityId": 45,
  "ruleType": "MustInclude",
  "content": "必须提及疫苗接种是最有效的预防手段",
  "applyEntityIds": "[45, 46, 47]",
  "status": 1
}
```

ruleType 可选值：`MustInclude`（必须包含）、`MustNotSay`（禁止表述）、`FactRule`（事实规则）。

### 实体关系 CRUD

```
POST /api/wiki/relation             # 创建关系
PUT  /api/wiki/relation/{id}        # 更新关系
DELETE /api/wiki/relation/{id}       # 删除关系
```

---

## 模板管理

```
GET    /api/template/list                    # 所有模板
GET    /api/template/list/paged?page=1&size=12  # 分页
GET    /api/template/{id}                    # 单个模板
POST   /api/template                         # 创建模板
PUT    /api/template/{id}                    # 更新模板
DELETE /api/template/{id}                    # 删除模板
```

**CdcArticleTemplate 请求体：**
```json
{
  "templateName": "标准科普讲解",
  "tag": "疾病科普",
  "purpose": "向普通公众解释疾病的基本知识和预防措施",
  "tone": "专业但温和，通俗易懂",
  "outlineStructure": "# 一、概述\n## 二、症状\n## 三、预防",
  "status": 1
}
```

---

## LLM 配置管理

```
GET    /api/llm-config                          # 所有配置
GET    /api/llm-config/type/{configType}         # 按类型筛选
GET    /api/llm-config/{id}                     # 单个配置
GET    /api/llm-config/default/{configType}      # 获取某类型的默认配置
POST   /api/llm-config                          # 创建配置
PUT    /api/llm-config/{id}                     # 更新配置
DELETE /api/llm-config/{id}                     # 删除配置
PUT    /api/llm-config/{id}/set-default          # 设为默认
```

configType 可选值：`text_generation`（文本生成）、`embedding`（向量嵌入）、`image_generation`（图片生成）。

**CdcLlmConfig 请求体：**
```json
{
  "configName": "通义千问 Turbo",
  "configType": "text_generation",
  "provider": "dashscope",
  "modelName": "qwen-turbo",
  "apiKeyEncrypted": "sk-xxx",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "params": { "temperature": 0.7, "maxTokens": 4096 },
  "isDefault": 1,
  "isEnabled": 1,
  "description": "适用于大部分文章生成任务"
}
```

---

## Agent API

Agent 端点不包裹在 Result 信封中，直接返回业务对象。

### 意图解析

```
POST /api/agent/parse-intent?user_text=写一篇关于HPV疫苗女性接种的科普文章
```
将自由文本解析为结构化参数：entity_type、entity_name、population_name、scene_name、word_count。

### 向量检索

```
POST /api/agent/retrieve
Content-Type: application/json

{
  "query_text": "HPV疫苗接种注意事项",
  "segments": [{ "id": 1, "content": "...", "embedding": [0.1, 0.2, ...] }],
  "top_k": 10
}
```
返回 `RetrieveResponse`，含 `top_k_segments` 和 `used_segments`。

### 文章生成

```
POST /api/agent/generate
Content-Type: application/json

{
  "article_id": 1,
  "step": "outline",
  "mode": 1,
  "entity_name": "HPV疫苗",
  "population_name": "女性",
  "scene_name": "接种",
  "template_name": "标准科普讲解",
  "word_count": 800,
  "wiki_segments": [...],
  "must_include": ["疫苗有效性", "接种年龄"],
  "must_not_say": ["绝对安全", "没有副作用"]
}
```

step 可选 `outline`（大纲）或 `draft`（正文）。

返回 `AgentResponse`：
```json
{
  "content": "生成的内容...",
  "quality_metrics": {
    "fact_check_passed": true,
    "rule_check_passed": true,
    "retry_count": 0,
    "quality_score": 0.95
  },
  "trace": [
    { "step": "intent_parse", "duration_ms": 1200 },
    { "step": "wiki_retrieve", "duration_ms": 800 },
    { "step": "outline_generate", "duration_ms": 3500 }
  ],
  "token_usage": {
    "prompt_tokens": 2500,
    "completion_tokens": 800,
    "total_tokens": 3300
  },
  "generation_meta": {
    "total_cost_ms": 5500,
    "content_length": 1200
  }
}
```

### 图片生成

```
POST /api/agent/generate-images
Content-Type: application/json

{
  "article_id": 1,
  "initial_draft": "文章正文...",
  "article_outline": "文章大纲...",
  "entity_name": "HPV疫苗",
  "style": "health_science",
  "max_images": 1
}
```
分析正文段落，识别需要配图的位置，调用多模态 API 生成图片。

### 健康检查

```
GET /api/agent/health
GET /health
```
返回 `{"status": "healthy"}`。

### 嵌入测试（调试用）

```
POST /api/agent/embedding/test
Content-Type: application/json

{ "text": "测试文本" }
```
验证 DashScope 嵌入模型是否正常返回向量。
