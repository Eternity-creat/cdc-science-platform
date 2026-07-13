# 本地后端与疾病/疫苗 Wiki 接入清单

更新时间：2026-07-02

## 已完成

1. 已从 GitHub 下载并解压项目到：
   `C:\.vscode\Disease control\cdc-science-platform`

2. 已确认新后端结构完整：
   - Java 后端：`cdc-backend`
   - Python Agent：`cdc-agent`
   - 前端：`cdc-frontend`
   - 数据库结构脚本：`db/init_schema.sql`
   - 接口与数据流文档：`docs/API.md`、`docs/DATA_FLOW.md`

3. 已验证 Java 后端可以编译通过：
   - 运行目录：`C:\.vscode\Disease control\cdc-science-platform\cdc-backend`
   - 命令：`.\mvnw.cmd -DskipTests package`
   - 结果：`BUILD SUCCESS`

4. 已补充疾病/疫苗 Wiki 数据脚本：
   - 文件：`db/init.sql`
   - 内容：150 个疾病实体、44 个疫苗实体、5258 条知识片段、1552 条生成规则
   - 只替换 `entity_type=1` 疾病和 `entity_type=2` 疫苗
   - 不覆盖人群、场景、文章模板数据
   - 导入前会清理疾病/疫苗对应的旧片段向量，避免残留向量影响后续检索

5. 已在本机完成一次实际导入和接口验证：
   - MySQL：`127.0.0.1:3307/cdc_knowledge`
   - 后端：`http://localhost:8080`
   - 表结构：已升级为 15 张表
   - 疾病：150 条
   - 疫苗：44 条
   - 人群：当前旧库占位 3 条，后续等其他同学补正式数据
   - 场景：当前旧库占位 3 条，后续等其他同学补正式数据
   - 模板：当前旧库已有 6 条样例
   - 接口验证：`/api/wiki/list/paged`、`/api/article/form/dropdown`、`/api/article/generate`、`/api/article/context/{id}` 均可返回数据

## 当前后端 Wiki 分类

`wiki_entity.entity_type` 已固定为四类：

- `1`：疾病
- `2`：疫苗
- `3`：人群
- `4`：场景

疾病和疫苗已经有数据脚本；人群、场景和文章模板后续由其他同学补充。

## 疾病/疫苗 Wiki 映射方式

疾病/疫苗主实体写入 `wiki_entity`：

- `std_name`：标准名称
- `alias`：别名 JSON，外文名也放在这里
- `summary`：简介

字段型知识写入 `wiki_segment`：

- 疾病的病因、症状、检查、治疗、预防等拆成片段
- 疫苗的适用对象、禁忌、接种事项、不良反应、免疫程序等拆成片段
- `source` 保留来源说明，方便后续追溯

生成约束写入 `wiki_rule`：

- `MustInclude`：文章必须覆盖的要点
- `MustNotSay`：禁止或谨慎表述
- `FactRule`：事实性规则，后续可扩展使用

实体关联写入 `wiki_relation`：

- 疾病与疫苗之间可用关系连接
- 人群/场景后续补齐后，也可以通过关系表挂到疾病或疫苗上

## 运行顺序

1. 先创建数据库结构：

```powershell
mysql -h 127.0.0.1 -P 3307 -u cdc_user -p cdc_knowledge < "C:\.vscode\Disease control\cdc-science-platform\db\init_schema.sql"
```

2. 再导入疾病/疫苗 Wiki：

```powershell
mysql -h 127.0.0.1 -P 3307 -u cdc_user -p cdc_knowledge < "C:\.vscode\Disease control\cdc-science-platform\db\init.sql"
```

3. 启动 Java 后端：

```powershell
cd "C:\.vscode\Disease control\cdc-science-platform\cdc-backend"
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:DB_URL="jdbc:mysql://127.0.0.1:3307/cdc_knowledge?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai&useSSL=false"
$env:DB_USERNAME="cdc_user"
$env:DB_PASSWORD="CdcAgent_2026!"
.\mvnw.cmd spring-boot:run
```

4. 验证接口：

```powershell
curl http://localhost:8080/api/wiki/list/paged?page=1"&"size=5"&"type=1
curl http://localhost:8080/api/wiki/list/paged?page=1"&"size=5"&"type=2
curl http://localhost:8080/api/article/form/dropdown
```

## 预期效果

导入后，后端可以通过 Wiki 接口查到疾病和疫苗实体。

创建文章时，前端下拉框应该能拿到：

- 疾病列表：来自 `wiki_entity.entity_type=1`
- 疫苗列表：来自 `wiki_entity.entity_type=2`
- 人群列表：来自 `wiki_entity.entity_type=3`，目前等其他同学补数据
- 场景列表：来自 `wiki_entity.entity_type=4`，目前等其他同学补数据
- 模板列表：来自 `cdc_article_template`，目前等其他同学补数据

文章生成上下文会从以下表组装：

- `wiki_entity`
- `wiki_segment`
- `wiki_rule`
- `wiki_relation`
- `cdc_article_template`

## 仍缺少的部分

这些不是疾病/疫苗 Wiki 的范围，后续由其他同学补：

- 人群 Wiki 数据：写入 `wiki_entity(entity_type=3)`，必要时补 `wiki_segment` 和 `wiki_relation`
- 场景 Wiki 数据：写入 `wiki_entity(entity_type=4)`，必要时补 `wiki_segment` 和 `wiki_relation`
- 文章模板数据：写入 `cdc_article_template`
- 如需真实 Agent 生成，还需要配置 LLM/Embedding API Key

## 注意事项

- 本次只做本地文件整理，不提交 GitHub。
- `db/init_schema.sql` 是建表脚本，不包含业务数据。
- `db/init.sql` 是疾病/疫苗 Wiki 数据脚本，只负责疾病和疫苗；模板、人群、场景暂时不纳入。
- 人群、场景、模板后续补齐后，不需要重做疾病/疫苗数据。
