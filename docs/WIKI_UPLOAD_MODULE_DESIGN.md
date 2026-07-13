# Wiki 文档上传模块方案设计

更新时间：2026-07-02

## 目标

建设一个本地轻量文档处理流程，把上传的权威指南、历史文章、问答对、模板说明等资料转成统一 Wiki 数据，最终服务于 Agent 生成。

本方案选择“方案 2：独立轻量文档处理工作流”作为落地方案；“方案 1：外部文档解析 API”作为复杂 PDF 或扫描件场景的兜底能力。

## 当前已有基础

本地后端已存在：

- `cdc_upload_task` 表
- `CdcUploadTask.java`
- `CdcUploadTaskMapper.java`
- `CdcUploadTaskMapper.xml`

当前代码里未检索到明确的 Wiki 文档上传 Controller，例如：

- `POST /api/wiki/upload`
- `MultipartFile`
- `UploadController`

因此目前可判断为：**已预留上传任务表和 Mapper，但完整上传接口、解析、清洗、分段、入库流程尚未实现或未同步到当前代码。**

补充核查结果：

- 前端 Wiki 页面有“导入”按钮，位于 `cdc-frontend/src/pages/WikiManagement.jsx`。
- 当前按钮绑定的 `handleImport` 逻辑为 `toast.info('功能开发中')`，没有真正上传文件。
- 前端 `cdc-frontend/src/api/wiki.js` 中没有 upload API 封装。
- 后端 `cdc-backend` 中没有检索到 `MultipartFile`、`/api/wiki/upload`、`UploadController` 等上传接口实现。

因此“预留上传接口”在当前本地代码里更准确地说是：**Wiki 页面预留了导入入口，数据库预留了上传任务表，但接口和处理流程还需要补开发。**

## 两方案对比

| 维度 | 方案 1：外部文档解析 API | 方案 2：本地轻量文档处理流程 |
| --- | --- | --- |
| 实现速度 | 快 | 中等 |
| 数据可控性 | 依赖外部服务 | 完全本地可控 |
| 数据合规 | 需确认资料能否外传 | 更适合疾控资料 |
| 复杂 PDF 支持 | 通常较好 | 取决于解析库和 OCR |
| 返回格式 | 外部 API 决定，需适配 | 可按 Wiki schema 设计 |
| 稳定性 | 受外部服务影响 | 受本地服务影响 |
| 成本 | 可能付费 | 主要是开发维护成本 |
| 长期扩展 | 受供应商限制 | 可加入审核、去重、版本管理 |

## 选型结论

选择方案 2 作为主流程，原因：

- 疾控知识库需要长期沉淀，不能只做文件附件管理。
- 数据最终要写入 `wiki_entity`、`wiki_segment`、`wiki_rule`、`wiki_relation`、`wiki_segment_embedding`。
- 本地流程可控，便于和现有数据库 schema、Agent 上下文结构对齐。
- 上传资料可能包含权威指南或内部整理资料，本地处理更稳妥。

保留方案 1 作为兜底：

- 扫描 PDF、复杂版式 PDF、本地解析质量差时，可接入外部文档解析 API。
- 外部解析结果仍必须经过本地标准化和审核后才能入库。

## 总体流程

```text
前端上传文件
→ 后端接收文件
→ 保存原始文件
→ 创建 cdc_upload_task
→ 异步解析文档
→ 文本清洗
→ 文本分段
→ 实体识别和字段抽取
→ 生成标准化 Wiki JSON
→ 人工确认或自动入库
→ 写入 wiki_entity / wiki_segment / wiki_rule / wiki_relation
→ 触发 wiki_segment_embedding 生成
→ 更新 cdc_upload_task 状态
```

## 建议接口设计

### 上传文件

```text
POST /api/wiki/upload
Content-Type: multipart/form-data
```

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | 上传文件 |
| `entityType` | int | 否 | 1疾病、2疫苗、3人群、4场景 |
| `entityName` | string | 否 | 指定实体名，未传则由系统识别 |
| `sourceType` | string | 否 | guideline/article/qa/manual |
| `updateMode` | string | 否 | append/merge/overwrite |
| `needReview` | boolean | 否 | 是否需要人工确认 |

响应：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": 1,
    "status": 0
  }
}
```

### 查询任务

```text
GET /api/wiki/upload/task/{taskId}
```

响应：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1,
    "fileName": "HPV疫苗指南.pdf",
    "filePath": "uploads/wiki/20260702/HPV疫苗指南.pdf",
    "status": 2,
    "resultMsg": "解析完成，待确认：1个实体、12条片段、3条规则"
  }
}
```

### 确认入库

```text
POST /api/wiki/upload/task/{taskId}/confirm
```

用于 `needReview=true` 时，把解析结果正式写入 Wiki 表。

### 取消任务

```text
DELETE /api/wiki/upload/task/{taskId}
```

用于取消待确认或失败任务。

## 状态设计

建议 `cdc_upload_task.status` 定义为：

| 状态 | 含义 |
| --- | --- |
| 0 | 待处理 |
| 1 | 处理中 |
| 2 | 解析完成，待确认 |
| 3 | 已入库 |
| 4 | 失败 |

如果第一版不做人审，可以简化为：

| 状态 | 含义 |
| --- | --- |
| 0 | 待处理 |
| 1 | 处理中 |
| 2 | 成功 |
| 3 | 失败 |

建议保留“待确认”，因为 Wiki 知识会直接影响 Agent 输出。

## 标准化 Wiki JSON

解析完成后统一成以下结构：

```json
{
  "entity": {
    "entityType": 2,
    "stdName": "HPV疫苗",
    "alias": ["人乳头瘤病毒疫苗", "HPV vaccine"],
    "summary": "用于预防 HPV 感染及相关疾病的疫苗。"
  },
  "segments": [
    {
      "title": "接种对象",
      "content": "推荐适龄人群接种，具体年龄范围以说明书和当地政策为准。",
      "source": "上传文件：HPV疫苗指南.pdf"
    }
  ],
  "rules": [
    {
      "ruleType": "MustInclude",
      "content": "应说明接种对象和免疫程序"
    },
    {
      "ruleType": "MustNotSay",
      "content": "不得表述为绝对安全或百分百预防"
    }
  ],
  "relations": [
    {
      "toEntityName": "宫颈癌",
      "relType": "prevents"
    }
  ]
}
```

## 入库映射

| 标准化字段 | 数据表 | 说明 |
| --- | --- | --- |
| `entity.entityType` | `wiki_entity.entity_type` | 1疾病、2疫苗、3人群、4场景 |
| `entity.stdName` | `wiki_entity.std_name` | 标准名称 |
| `entity.alias` | `wiki_entity.alias` | JSON 字符串或数组，接口层建议返回数组 |
| `entity.summary` | `wiki_entity.summary` | 简介 |
| `segments[].content` | `wiki_segment.content` | 片段正文 |
| `segments[].source` | `wiki_segment.source` | 来源 |
| `rules[]` | `wiki_rule` | MustInclude/MustNotSay/FactRule |
| `relations[]` | `wiki_relation` | 实体关系 |
| segment embedding | `wiki_segment_embedding` | 异步生成或懒加载补算 |

## 文档解析与清洗

第一版建议支持：

- TXT
- Markdown
- DOCX
- XLSX/CSV
- 可复制文本型 PDF

暂缓支持：

- 扫描 PDF
- 图片 OCR
- 复杂双栏 PDF

清洗规则：

- 去除空行、重复空白、页眉页脚。
- 保留标题层级和来源文件名。
- 过短片段合并，过长片段按段落或长度切分。
- 删除重复段落。

## 分段规则

优先级：

1. 按标题层级切分。
2. 按自然段切分。
3. 单段过长时按 500-1000 中文字切分。
4. 单段过短时合并相邻段落。

片段格式建议：

```text
[接种对象] 推荐适龄女性接种……
[禁忌] 对疫苗成分过敏者禁用……
```

## 去重与更新策略

建议第一版支持三种模式：

| 模式 | 含义 |
| --- | --- |
| append | 只新增，不覆盖旧内容 |
| merge | 同名实体合并，重复片段跳过 |
| overwrite | 覆盖该实体旧片段和规则 |

默认使用 `merge`。

去重规则：

- 实体去重：`entity_type + std_name`
- 片段去重：`entity_id + content_hash`
- 规则去重：`entity_id + rule_type + content`
- 关系去重：`from_eid + to_eid + rel_type`

## 异常处理

| 场景 | 处理方式 |
| --- | --- |
| 文件为空 | 任务失败，写入 result_msg |
| 文件格式不支持 | 任务失败，提示支持格式 |
| 解析失败 | 任务失败，保留原文件路径 |
| 未识别实体 | 标记待确认，要求人工补 entityName/entityType |
| 重复实体 | 默认 merge |
| 部分片段失败 | 成功部分入库，失败部分写 result_msg |
| embedding 失败 | 不阻断入库，后续懒加载补算 |

## 第一版落地开发清单

1. 新增 `WikiUploadController`
2. 新增 `WikiUploadService`
3. 实现文件保存到 `uploads/wiki/yyyyMMdd/`
4. 写入 `cdc_upload_task`
5. 实现 TXT/Markdown/DOCX 基础解析
6. 实现清洗和分段
7. 实现标准化 Wiki JSON
8. 实现 merge 模式入库
9. 实现任务状态更新和错误记录
10. 接入前端任务查询和确认入库

## 仍需确认

- 预留上传接口是否在未同步代码中存在。
- 第一版是否必须支持 PDF。
- 是否需要人工审核后入库。
- 上传文件存储位置是否有统一规范。
- 外部解析 API 是否允许作为兜底。
- 人群/场景/模板是否也走该上传流程。
