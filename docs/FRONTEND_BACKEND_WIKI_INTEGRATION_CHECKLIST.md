# 前后端字段与 Wiki 导入联调清单

更新时间：2026-07-11

## 1. 全链路字段统一

### 文章创建页 `/create`
前端提交到 `POST /api/article/generate`，字段使用 camelCase：

| 前端字段 | 后端字段 | 数据库字段 | 说明 |
| --- | --- | --- | --- |
| mode | mode | cdc_article_request.mode | structured / free_text |
| entityType | entity_type | cdc_article_request.entity_type | 1疾病，2疫苗，3人群，4场景 |
| entityId | entity_id | cdc_article_request.entity_id | 主实体 ID |
| populationId | population_id | cdc_article_request.population_id | 可为空，数据来自 wiki_entity type=3 |
| sceneId | scene_id | cdc_article_request.scene_id | 可为空，数据来自 wiki_entity type=4 |
| templateId | template_id | cdc_article_request.template_id | 可为空，数据来自 cdc_article_template |
| wordCount | word_count | cdc_article_request.word_count | 文章字数 |
| userText | user_text | cdc_article_request.user_text | 自由输入文本 |

下拉接口：`GET /api/article/form/dropdown`

返回字段：
- diseaseList：疾病实体，来自 `wiki_entity.entity_type=1`
- vaccineList：疫苗实体，来自 `wiki_entity.entity_type=2`
- populationList：人群实体，来自 `wiki_entity.entity_type=3`
- sceneList：场景实体，来自 `wiki_entity.entity_type=4`
- templateList：模板，来自 `cdc_article_template`

### Wiki 知识库页 `/wiki`
实体字段：

| 前端字段 | 后端字段 | 数据库字段 |
| --- | --- | --- |
| id | id | wiki_entity.id |
| entityType | entity_type | wiki_entity.entity_type |
| stdName | std_name | wiki_entity.std_name |
| alias | alias | wiki_entity.alias |
| summary | summary | wiki_entity.summary |
| segments | segments | wiki_segment |
| rules | rules | wiki_rule |
| relatedIds | related_ids | wiki_relation |

### 模板页 `/templates`
模板字段：

| 前端字段 | 后端字段 | 数据库字段 |
| --- | --- | --- |
| id | id | cdc_article_template.id |
| templateName | template_name | cdc_article_template.template_name |
| tag | tag | cdc_article_template.tag |
| purpose | purpose | cdc_article_template.purpose |
| tone | tone | cdc_article_template.tone |
| outlineStructure | outline_structure | cdc_article_template.outline_structure |
| status | status | cdc_article_template.status |
| createTime | create_time | cdc_article_template.create_time |

## 2. 页面点击链路

已接通的页面路由：
- `/articles`：文章列表
- `/create`：新建文章
- `/article/:id`：文章工作台
- `/wiki`：Wiki 知识库
- `/templates`：模板管理
- `/llm-config`：LLM 配置

已接通的点击链路：
- 文章列表点击“新建”进入 `/create`
- 创建文章成功后进入 `/article/:id`
- 文章列表点击文章进入 `/article/:id`
- 侧边栏可进入 Wiki、模板、LLM 配置
- Wiki 页面“导入”按钮已接入上传预览/确认流程

## 3. Wiki 导入流程

前端按钮：`/wiki` 页面左上角“导入”。

后端接口：
- `POST /api/wiki/upload?entityType=1`：上传文件并解析预览
- `GET /api/wiki/upload/{taskId}`：查看预览结果
- `POST /api/wiki/upload/{taskId}/confirm`：确认入库

支持文件类型：
- `.json`
- `.md`
- `.txt`
- `.docx`
- `.pdf`

导入策略：
- 上传后只预览，不立即写入业务表。
- 用户点击“确认入库”后写入。
- 同名实体按后端规则覆盖。
- 当前没有把未交付的人群/场景/模板样例数据写入 `init.sql`。

## 4. 验证结果

已执行：
- Java 后端：`mvnw.cmd -DskipTests package`，通过。
- 前端：`npm.cmd run build`，通过。
- Python Agent：关键流式生成文件 `py_compile`，通过。

注意：
- 前端构建存在 Vite chunk size warning，只是包体积提示，不影响运行。
- 当前 `数据库Json.py` 字段是应急知识文档索引字段，不是人群/场景/模板字段来源。
- 人群/场景/模板正式数据需等待学弟学妹交付后再导入或写入 SQL。