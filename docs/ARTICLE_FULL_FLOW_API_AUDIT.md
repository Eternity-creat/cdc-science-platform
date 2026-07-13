# 文章全流程接口排查清单

更新时间：2026-07-02

## 目标

覆盖文章从创建、上下文组装、大纲生成、正文生成、人工编辑、确认、历史回退、配图、删除的完整接口链路，检查返回字段完整性、异常报错、分页、空数据边界和状态流转。

## 当前已验证

| 模块 | 接口 | 验证情况 | 结果 |
| --- | --- | --- | --- |
| Wiki 分页 | `GET /api/wiki/list/paged?page=1&size=5&type=1` | 疾病列表可返回 | 通过 |
| Wiki 分页 | `GET /api/wiki/list/paged?page=1&size=5&type=2` | 疫苗列表可返回 | 通过 |
| 表单下拉 | `GET /api/article/form/dropdown` | 疾病、疫苗、人群、场景、模板列表可返回 | 通过 |
| 创建文章 | `POST /api/article/generate` | 表单模式创建文章，可返回 articleId 和 context | 通过 |
| 上下文 | `GET /api/article/context/{id}` | 可组装实体、模板、片段、规则 | 通过 |
| 保存大纲 | `PUT /api/article/{id}/outline` | 可保存纯文本大纲并写修改历史 | 通过 |
| 确认大纲 | `POST /api/article/{id}/confirm-outline` | 可确认大纲 | 通过 |
| 保存正文 | `PUT /api/article/{id}/draft` | 可保存纯文本正文并写修改历史 | 通过 |
| 自动保存 | `POST /api/article/{id}/autosave` | 可轻量保存正文 | 通过 |
| 确认正文 | `POST /api/article/{id}/confirm-draft` | 可写入终稿并推进状态 | 通过 |
| 修改历史 | `GET /api/article/{id}/modifications` | 可查到修改记录 | 通过 |
| 回退历史 | `POST /api/article/{id}/revert` | 有前版本内容时可回退；首次保存前版本为空时按设计返回错误 | 通过 |
| 配图保存 | `POST /api/article-image` | 可保存配图记录 | 通过 |
| 配图说明 | `PUT /api/article-image/{id}/caption` | 可更新配图说明 | 通过 |
| 文章分页 | `GET /api/article/list/paged` | 可返回分页结果 | 通过 |
| 删除文章 | `DELETE /api/article/{id}` | 可删除文章并级联清理关联记录 | 通过 |

本轮实际测试创建了临时文章并在测试结束时删除。Agent 生成类接口未纳入本轮实测，因为需要 Agent 服务与模型 API Key 同时可用。

## 后端统一响应

Java 后端统一返回：

```json
{
  "code": 200,
  "msg": "success",
  "data": {}
}
```

业务异常也返回 HTTP 200，但 `code=500`：

```json
{
  "code": 500,
  "msg": "文章不存在: id=99999",
  "data": null
}
```

## 待排查接口表

| 阶段 | 接口 | 方法 | 重点检查 | 预期结果 |
| --- | --- | --- | --- | --- |
| 文章列表 | `/api/article/list` | GET | 是否返回模板名、实体名、修改次数 | `code=200`，列表字段完整 |
| 文章分页 | `/api/article/list/paged?page=1&size=10&status=&keyword=` | GET | 分页、状态筛选、关键词、空列表 | 返回 `list,total,page,size` |
| 文章详情 | `/api/article/{id}` | GET | id 存在/不存在 | 存在返回文章；不存在返回统一错误 |
| 表单创建 | `/api/article/generate` | POST | 正常参数、缺实体、缺模板、空人群/场景 | 创建文章或返回明确错误 |
| 自由文本创建 | `/api/article/generate/text` | POST | Agent 在线/离线、无模板、无法识别实体 | 成功创建或统一错误 |
| 上下文 | `/api/article/context/{id}` | GET | 片段、规则、模板、人群、场景是否完整 | 返回 `WikiTemplateContext` |
| 生成大纲 | `/api/article/{id}/generate-outline` | POST | Agent 在线/离线、无片段、无 API Key | 成功后 `status=2` |
| 生成正文 | `/api/article/{id}/generate-draft` | POST | 有无大纲、Agent 在线/离线 | 成功后 `status=3` |
| 保存大纲 | `/api/article/{id}/outline` | PUT | 纯文本体、空内容、修改历史 | 保存成功并写 `cdc_article_modification` |
| 保存正文 | `/api/article/{id}/draft` | PUT | 纯文本体、空内容、修改历史 | 保存成功并写 `cdc_article_modification` |
| 确认大纲 | `/api/article/{id}/confirm-outline` | POST | 可选正文体、状态是否保持 2 | 返回 true |
| 确认正文 | `/api/article/{id}/confirm-draft` | POST | 无初稿时是否报错 | 成功后 `status=4`，写 `final_article` |
| 兼容确认 | `/api/article/{id}/confirm` | POST | 与 confirm-draft 行为一致性 | 成功后 `status=4` |
| 重新生成大纲 | `/api/article/{id}/regenerate-outline` | POST | 旧大纲是否进历史 | 新大纲返回，历史保留 |
| 重新生成正文 | `/api/article/{id}/regenerate-draft` | POST | 旧正文是否进历史 | 新正文返回，历史保留 |
| 自动保存 | `/api/article/{id}/autosave` | POST | field/content 缺失、是否不写历史 | 缺 content 返回错误；正常轻量保存 |
| 回退历史 | `/api/article/{id}/revert` | POST | modificationId 缺失、不属于该文章、beforeContent 为空 | 成功回退或明确错误 |
| 修改历史 | `/api/article/{id}/modifications` | GET | 顺序、字段完整 | 返回 before/after/operationType |
| Agent 轨迹 | `/api/article/{id}/trace` | GET | 是否记录 stepName/costTime/stepContent | 返回轨迹列表 |
| 删除文章 | `/api/article/{id}` | DELETE | 是否级联删除 request、trace、image、modification | 删除成功，关联记录清理 |
| 配图列表 | `/api/article-image/article/{articleId}` | GET | 无图/有图 | 返回列表 |
| 配图保存 | `/api/article-image` | POST | 必填字段、路径、caption | 返回保存后的图片记录 |
| 配图批量保存 | `/api/article-image/batch` | POST | 空数组、部分缺字段 | 返回保存列表 |
| 配图更新 | `/api/article-image/{id}` | PUT | id 不存在/字段更新 | 返回更新数量 |
| 配图说明 | `/api/article-image/{id}/caption` | PUT | caption 空值/id 不存在 | 返回更新数量 |
| 配图删除 | `/api/article-image/{id}` | DELETE | id 存在/不存在 | 返回删除数量 |

## 边界场景

| 类型 | 场景 | 预期 |
| --- | --- | --- |
| 参数缺失 | 创建文章缺 `entityId` 或 `templateId` | 统一错误，不出现 500 堆栈 |
| 空数据 | 模板、人群、场景为空 | 前后端确认是否允许为空 |
| ID 不存在 | 文章、修改记录、配图 id 不存在 | `code=500` 或返回 0，前端可识别 |
| Agent 离线 | 生成大纲/正文、自由文本解析 | 返回明确错误，文章状态不应错误推进 |
| API Key 缺失 | embedding 或 Agent LLM 调用失败 | 不影响上下文查询；生成接口应给明确错误 |
| 分页越界 | page 很大或 page<1 | page<1 后端会修正为 1；越界返回空列表 |
| 内容为空 | 保存空大纲/正文 | 需和前端确认是否允许 |
| 回退无前版本 | `beforeContent=null` | 返回“该修改记录没有可回退的前一版本内容” |

## 建议测试顺序

1. `GET /api/article/form/dropdown`
2. `POST /api/article/generate`
3. `GET /api/article/context/{articleId}`
4. `PUT /api/article/{id}/outline`
5. `POST /api/article/{id}/confirm-outline`
6. `PUT /api/article/{id}/draft`
7. `POST /api/article/{id}/confirm-draft`
8. `GET /api/article/{id}`
9. `GET /api/article/{id}/modifications`
10. `POST /api/article/{id}/revert`
11. `GET /api/article/list/paged`
12. `DELETE /api/article/{id}`

真实 Agent 生成相关接口需要 Agent 服务和模型 API Key 可用后再测：

- `POST /api/article/{id}/generate-outline`
- `POST /api/article/{id}/generate-draft`
- `POST /api/article/{id}/regenerate-outline`
- `POST /api/article/{id}/regenerate-draft`
- `POST /api/article/generate/text`

## 目前仍需前端确认

- 页面实际使用哪些接口。
- 每个页面实际展示哪些字段。
- 空数据时页面如何展示。
- `code=500` 但 HTTP 200 的错误格式前端是否能统一处理。
- 人群/场景是否必选，模板是否必选。
- 自动保存触发频率和字段名使用 `outline` / `initial_draft` / `final_article` 中哪几个。
