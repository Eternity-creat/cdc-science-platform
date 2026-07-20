# Wiki 文档上传模块实现说明

最后更新：2026-07-19

本文档描述 `cdc-backend` 中 Wiki 文档上传模块的**当前实现**。它已经完整实现并接入前端 Wiki 管理页。

> 早期版本（v1.0 / v1.1 阶段）的"方案设计"内容已废弃；当前实现完整覆盖了原方案 2（本地轻量文档处理工作流）的所有目标，PDF 解析也已落地。

## 实现位置

| 文件 | 作用 |
|---|---|
| `controller/WikiUploadController.java` | `POST /api/wiki/upload`、`GET /api/wiki/upload/{taskId}`、`POST /api/wiki/upload/{taskId}/confirm` |
| `service/WikiUploadService.java` | 接口 |
| `service/impl/WikiUploadServiceImpl.java` | 落盘 → 解析 → 预览 → 确认入库 |
| `event/SegmentChangedEvent.java` | 片段变更 Spring 事件（CREATED/UPDATED/DELETED） |
| `event/EmbeddingEventListener.java` | 监听 `SegmentChangedEvent`，异步计算 embedding 并入库（**不走 Agent**） |
| `service/EmbeddingService.java` | Java 直接调 DashScope `/embeddings`（OpenAI 兼容 REST），含 `cdc_embedding_cache` 哈希去重 |
| `config/AsyncConfig.java` | `embeddingExecutor` 线程池（core=2 / max=4 / queue=50） |

## 端到端流程

```http
┌──────────────┐                  ┌────────────────────┐                  ┌──────────────────┐
│ 前端 Wiki 页  │                  │ cdc-backend         │                  │ DashScope         │
│ WikiManagement│                 │ WikiUploadServiceImpl│                 │ /embeddings       │
└──────┬───────┘                  └──────────┬─────────┘                  └────────┬─────────┘
       │ POST /api/wiki/upload (multipart)    │                                       │
       │─────────────────────────────────────►│ 1. 保存文件到 uploads/wiki/{uuid}.{ext}│
       │                                      │ 2. 插 cdc_upload_task (status=0)      │
       │                                      │ 3. parseFile() 按扩展名分支解析        │
       │                                      │    - json : parseJson()               │
       │                                      │    - md/txt/docx/pdf: extractText()   │
       │                                      │ 4. 构造 WikiUploadPreviewDTO           │
       │                                      │ 5. 更新 task status=1                 │
       │ ◄────────────────────────────────── │ 返回预览                               │
       │  {taskId, entities[], segmentCount,  │                                       │
       │   ruleCount, warnings[]}             │                                       │
       │                                      │                                       │
       │ POST /api/wiki/upload/{taskId}/confirm│                                       │
       │─────────────────────────────────────►│ @Transactional                        │
       │                                      │ 对每个 entity:                         │
       │                                      │  • findByName 命中 → 整段删除           │
       │                                      │    (先发 SegmentChangedEvent DELETED)  │
       │                                      │  • insert entity / segments / rules    │
       │                                      │  • 每条新 segment 发 CREATED 事件      │
       │ ◄────────────────────────────────── │ 返回 {insertedCount, overwrittenCount, │
       │  {insertedCount, segmentCount, ...}  │   segmentCount, ruleCount}            │
       │                                      │                                       │
       │                                      │ @Async("embeddingExecutor")            │
       │                                      │ EmbeddingEventListener.onSegmentChanged│
       │                                      │  • DELETED → wiki_segment_embedding    │
       │                                      │    .deleteBySegmentId                 │
       │                                      │  • CREATED/UPDATED →                  │
       │                                      │      1. computeContentHash (MD5)       │
       │                                      │      2. embeddingService.compute... ───►│ POST /embeddings
       │                                      │      3. 序列化为 JSON                  │ ◄──── vector
       │                                      │      4. wiki_segment_embedding.upsert  │
       │                                      │                                       │
```

## 支持的输入格式

| 扩展名 | 解析方式 | 库 |
|---|---|---|
| `.json` | 直接 `ObjectMapper.readTree()`，支持单对象 / `{entities:[...]}` / `[...]` 三种顶层结构 | Jackson（自带） |
| `.md` / `.txt` | 按 UTF-8 全文读取，正则识别 `# ` 标题、`MustInclude:` / `禁止表述:` 等规则行 | JDK |
| `.docx` | `XWPFDocument.getParagraphs()` 拼接 | Apache POI 5.2.5 |
| `.pdf` | `PDFTextStripper.getText()` | PDFBox 3.0.2 |

不支持的扩展名直接抛 `RuntimeException("不支持的文件类型: <ext>")`。

## JSON 解析规则

`parseJsonEntity()` 容忍多种字段命名方式（camelCase / snake_case / 中英别名），最终都映射成统一的 `WikiUploadEntityDTO`：

| 标准化字段 | 接受的 JSON 键名 |
|---|---|
| `entityType` | `entityType`, `entity_type`, `type` |
| `stdName` | `stdName`, `std_name`, `name`, `title` |
| `alias` | `alias`（数组或字符串都接受，字符串内部用 Jackson 序列化） |
| `summary` | `summary`, `intro`, `description` |
| segments | `segments`, `wikiSegments`, `wiki_segments`, `authoritativeSegments`, `fragments`（可同时出现在多个字段里，全部合并） |
| rules | `rules`（每个元素可以是字符串或 `{ruleType, content}` 对象） |
| MustInclude | `mustInclude`, `must_include` |
| MustNotSay | `mustNotSay`, `must_not_say` |

> 如果 `segments` 为空但有 `summary`，会自动把 `summary` 作为唯一一条 segment 入库，保证 Agent 至少有一段可用知识。

## 非 JSON 文件的解析规则

`md/txt/docx/pdf` 走统一的 `parseText()`：

1. **实体名**：取第一个 `# 标题` 行；否则用文件名（去扩展名）
2. **summary**：取第一个非规则行、非标题的段落，超过 500 字截断
3. **规则行识别前缀**：
   - `MustInclude:` / `MustInclude：` / `必须包含:` / `必须包含：` → `MustInclude`
   - `MustNotSay:` / `MustNotSay：` / `禁止表述:` / `禁止表述：` / `不能说:` / `不能说：` → `MustNotSay`
4. **segments 切分**：按段落聚合，每段 >900 字触发切片；规则行、标题行不进入 segments；`source` 默认为 `文件名:扩展名`

## 任务状态机

`cdc_upload_task.status` 当前定义：

| status | 含义 | 设置时机 |
|---|---|---|
| 0 | uploaded | 文件已落盘 |
| 1 | parsed | 解析完成，前端可预览 |
| 2 | imported | 用户已确认入库 |
| 3 | failed | 解析或处理失败，`result_msg` 记录原因 |

> 注：早期方案文档里写的"0 待处理 / 1 处理中 / 2 解析完成待确认 / 3 已入库 / 4 失败"与实际实现不一致，实际就是 0/1/2/3 这四态。

## 入库策略

**当前实现采用「同名实体覆盖」策略**（不是方案文档里提到的 `merge`）：

```java
WikiEntity old = entityMapper.findByName(item.getStdName(), item.getEntityType());
if (old != null) {
    deleteExistingEntity(old.getId());  // 级联删除旧 segments / rules / relations
    result.setOverwrittenCount(result.getOverwrittenCount() + 1);
} else {
    result.setInsertedCount(result.getInsertedCount() + 1);
}
```

`deleteExistingEntity` 顺序：先对每条旧 segment 发 `DELETED` 事件（让 EmbeddingEventListener 同步删除 `wiki_segment_embedding` 记录），再删 segments / rules / relations / entity 本体。

## Embedding 异步补算

`@Async("embeddingExecutor") @EventListener` 模式，**不经过 Agent**：

```text
SegmentChangedEvent  ──►  EmbeddingEventListener.onSegmentChanged
                              │
                              ├─ DELETED   → wiki_segment_embedding.deleteBySegmentId
                              └─ CREATED   → computeContentHash (MD5)
                                  UPDATED     ↓
                                            EmbeddingService.computeEmbedding
                                                │
                                                ├─ 优先 cdc_embedding_cache 命中复用
                                                └─ 未命中 → POST DashScope /embeddings (batch≤25)
                                                              │
                                                              ↓
                                            WikiSegmentEmbedding upsert
                                              (segment_id, entity_id, content_hash,
                                               embedding JSON, model_version, dimensions)
```

设计取舍（直接看 `EmbeddingEventListener` 顶部注释）：Embedding 计算放在 Java 端是为了**减少跳数、降低与 Agent 的耦合**。Agent 只负责文章生成这种重度 LLM 任务，embedding 这种纯 REST 调用由 Java 直接打 DashScope。

## 接口契约

完整接口定义和示例见 `docs/WIKI_UPLOAD_API_USAGE.md`。本文档不再重复。

## 不再适用的事项

下列内容是早期方案设计时的考量，**当前实现已做出不同取舍**，留作历史记录：

- ~~`updateMode: append/merge/overwrite` 模式选择~~ → 实际只支持覆盖（同名实体）
- ~~`sourceType: guideline/article/qa/manual` 分类~~ → 实际由 `wiki_segment.source` 自由文本记录
- ~~`needReview` 开关~~ → 实际一律先预览后确认，无自动入库分支
- ~~扫描 PDF / OCR 兜底~~ → 暂未实现，仅支持可复制文本型 PDF
- ~~XLSX/CSV~~ → 暂未实现
- ~~"外部文档解析 API"作为方案 1 兜底~~ → 未接入

## 仍可演进的方向

- 支持增量更新（按 `entityType + stdName + content_hash` 去重片段）
- 支持 XLSX/CSV（表格型知识）
- 支持扫描 PDF + OCR（需要新增 tesseract / 商业 OCR）
- 接入外部文档解析 API 作为复杂 PDF 兜底
- 大文件分块上传（当前一次 POST 上传整个文件）
