# RAG 检索优化方法与实现说明

本文记录本项目本次 RAG 检索优化的背景、方法、实现步骤和验证方式，便于后续学习、复盘和继续迭代。

## 一、为什么要优化 RAG 检索

在科普文章生成场景中，用户通常会输入类似：

```text
请帮我写一篇流感疫苗科普文章，面向老人、儿童、孕妇、慢性病患者，包含流感危害、接种时间、注意事项和误区。
```

系统需要从知识库中检索相关知识，再交给大模型生成大纲和初稿。

优化前的主要问题是：向量检索容易把“语义相近但主题不相关”的片段召回。例如用户要写“流感疫苗”，但因为请求里包含“老人”“学校”“社区”等词，系统可能召回：

- 老年人高血压长期用药管理
- 学校糖尿病饮食管理
- 社区新冠疫苗预约安排
- 儿童手足口病护理

这些片段虽然在人群或场景上相似，但和“流感/流感疫苗”主题不一致，会造成文章内容跑题、知识引用不准、生成质量不稳定。

## 二、优化目标

本次优化目标不是简单提高向量相似度，而是让检索结果更符合文章主题。

核心目标：

1. 主实体知识优先，例如流感、流感疫苗等疾病/疫苗知识。
2. 人群和场景知识必须和主实体相关，不能只因为出现“老人”“学校”就被召回。
3. 支持实体别名，例如流感、流行性感冒、甲流可以互相命中。
4. 自由文本解析结果找不到精确实体时，可以唯一模糊匹配；如果匹配不唯一，则不强行绑定错误实体。
5. 保持旧数据兼容，缺少实体类型的旧片段仍可参与召回。

## 三、核心思路

本次采用“两阶段检索”：

```text
用户需求
  |
  v
实体解析：疾病/疫苗、人群、场景、模板
  |
  v
知识片段分层过滤
  |
  v
过滤后的候选片段
  |
  v
向量相似度召回
  |
  v
交给大模型生成大纲/初稿
```

### 第一阶段：分层过滤

知识片段按所属实体类型分为：

| 类型 | 含义 | 策略 |
|---|---|---|
| 1 | 疾病 | 主实体片段，直接保留 |
| 2 | 疫苗 | 主实体片段，直接保留 |
| 3 | 人群 | 必须命中主实体名或别名 |
| 4 | 场景 | 必须命中主实体名或别名 |
| 空/未知 | 旧数据 | 兼容保留 |

例如主题是“流感疫苗”，别名是“流感、流行性感冒、甲流”：

- “老年人接种流感疫苗注意事项”会保留
- “学校流感暴发处置流程”会保留
- “老年人高血压长期用药管理”会过滤
- “学校糖尿病饮食管理”会过滤

### 第二阶段：向量召回

过滤后的候选片段再进入向量召回。

这样做的好处是：向量检索只在主题相关的候选集合里排序，不会被高分但跑题的片段干扰。

## 四、后端实现

后端主要负责把“实体信息”和“片段所属实体类型”传给 Agent。

### 1. 知识片段带上实体类型

修改位置：

- `cdc-backend/src/main/java/com/cdc/cdcbackend/dto/WikiSegmentEmbeddingDTO.java`
- `cdc-backend/src/main/java/com/cdc/cdcbackend/dto/WikiTemplateContext.java`
- `cdc-backend/src/main/resources/mapper/WikiSegmentMapper.xml`

查询知识片段时，通过 `wiki_segment` 关联 `wiki_entity`，补充：

```text
owner_entity_type
```

这样 Agent 才知道某条片段属于疾病、疫苗、人群还是场景。

### 2. 自由文本解析结果保存实体名称

修改位置：

- `cdc-backend/src/main/java/com/cdc/cdcbackend/entity/CdcArticleRequest.java`
- `cdc-backend/src/main/resources/mapper/CdcArticleRequestMapper.xml`

新增保存字段：

- `entityName`
- `populationName`
- `sceneName`

这些字段用于后续生成、追踪和上下文降级。

### 3. 实体匹配支持别名和唯一模糊匹配

修改位置：

- `cdc-backend/src/main/java/com/cdc/cdcbackend/mapper/WikiEntityMapper.java`
- `cdc-backend/src/main/resources/mapper/WikiEntityMapper.xml`
- `cdc-backend/src/main/java/com/cdc/cdcbackend/service/impl/ArticleServiceImpl.java`

匹配顺序：

```text
标准名精确匹配
  |
别名精确匹配
  |
唯一模糊匹配
  |
找不到或多结果：返回 null，不强行绑定
```

这样可以处理：

- 用户写“流感”，知识库标准名是“流行性感冒”
- 用户写“甲流”，知识库别名包含“甲流”
- 用户输入不够标准，但只模糊命中一个实体

如果模糊命中多个实体，则宁可降级，不乱选。

### 4. 传给 Agent 的字段

修改位置：

- `cdc-backend/src/main/java/com/cdc/cdcbackend/agent/AgentClient.java`

后端调用 Agent 时传递：

```json
{
  "entity_name": "流感",
  "entity_alias": "流行性感冒,甲流",
  "population_name": "老年人",
  "scene_name": "学校",
  "user_text": "用户原始自由文本",
  "wiki_segments": [
    {
      "content": "...",
      "owner_entity_type": 1,
      "embedding": [...]
    }
  ]
}
```

## 五、Agent 实现

Agent 负责真正执行分层过滤和向量召回。

核心文件：

- `cdc-agent/app/tools/rag_retrieval.py`
- `cdc-agent/app/workflow/nodes.py`
- `cdc-agent/app/api/agent.py`
- `cdc-agent/app/models/schemas.py`
- `cdc-agent/app/models/state.py`

### 1. 构建主实体关键词

主实体关键词来自：

- `entity_name`
- `entity_alias`

例如：

```text
entity_name = 流感
entity_alias = 流行性感冒,甲流
```

得到关键词：

```text
流感
流行性感冒
甲流
```

### 2. 过滤人群和场景片段

规则：

```text
疾病/疫苗片段：直接保留
人群/场景片段：内容必须包含主实体关键词
旧数据片段：兼容保留
```

伪代码：

```python
for segment in wiki_segments:
    if owner_entity_type in [1, 2]:
        keep(segment)
    elif owner_entity_type in [3, 4]:
        if content contains any(entity_name or entity_alias):
            keep(segment)
    else:
        keep_for_compatibility(segment)
```

### 3. 增强检索 query

向量检索 query 不再只用一个短主题，而是组合：

```text
主实体 + 人群相关 + 场景场景 + 用户自由文本摘要
```

例如：

```text
流感 老年人相关 学校场景
```

这样能让向量排序更接近文章真实需求。

### 4. 预计算向量优先

如果候选片段都有 `embedding`，使用预计算向量：

```text
mode = precomputed
```

如果缺失 embedding，则降级为实时向量：

```text
mode = realtime
```

这样既能利用知识库已有向量，又能兼容旧数据或临时数据。

## 六、模拟数据验证

本次用 9 条模拟片段验证优化效果。

用户主题：

```text
流感疫苗，面向老年人和学校场景
```

模拟知识片段：

| ID | 类型 | 内容 | 是否相关 | 模拟向量分 |
|---:|---|---|---|---:|
| 1 | 疾病 | 流感病原学与传播路径 | 是 | 0.86 |
| 2 | 疾病 | 流感典型症状和重症风险 | 是 | 0.80 |
| 3 | 人群 | 老年人高血压长期用药管理 | 否 | 0.97 |
| 4 | 人群 | 老年人接种流感疫苗注意事项 | 是 | 0.83 |
| 5 | 场景 | 学校糖尿病饮食管理 | 否 | 0.96 |
| 6 | 场景 | 学校流感暴发处置流程 | 是 | 0.82 |
| 7 | 人群 | 儿童手足口病居家护理 | 否 | 0.99 |
| 8 | 场景 | 社区新冠疫苗预约安排 | 否 | 0.98 |
| 9 | 人群 | 孕妇接种流行性感冒疫苗建议 | 是 | 0.79 |

### 优化前

只看向量分数，Top5 为：

```text
[7, 8, 3, 5, 1]
```

其中真正相关的只有 ID 1。

结果：

| 指标 | 数值 |
|---|---:|
| Top5 相关片段 | 1 |
| Top5 噪声片段 | 4 |
| Top5 准确率 | 20% |

### 优化后

先过滤，再召回，Top5 为：

```text
[1, 4, 6, 2, 9]
```

全部与流感/流感疫苗主题相关。

结果：

| 指标 | 数值 |
|---|---:|
| Top5 相关片段 | 5 |
| Top5 噪声片段 | 0 |
| Top5 准确率 | 100% |

过滤统计：

```text
total=9
primary=2
context=7
context_kept=3
legacy=0
candidates=5
query=流感 老年人相关 学校场景
mode=precomputed
```

含义：

- 总片段 9 条
- 疾病/疫苗主实体片段 2 条，直接保留
- 人群/场景上下文片段 7 条，只保留 3 条
- 最终进入向量召回的候选片段为 5 条

## 七、线上如何验收

可以在前端创建文章，输入：

```text
请帮我写一篇流感疫苗拟人叙事风格的科普文章，全文约1000字。以流感疫苗第一人称视角讲故事，面向老人、儿童、孕妇、慢性病患者等重点接种人群，内容包含流感的危害、易感人群风险、接种适宜时间、接种前后注意事项、常见误区、居家月度防护清单，语言生动亲切，故事感强。
```

重点观察：

1. 右侧“上下文”里是否主要是流感/流感疫苗相关内容。
2. 是否减少高血压、糖尿病、新冠、手足口病等跑题知识。
3. 初稿内容是否围绕流感疫苗，而不是泛泛讲老人、学校或社区。
4. Agent 日志中是否出现分层检索统计。

日志示例：

```text
RAG分层检索: total=9 primary=2 context=7->3 legacy=0 candidates=5 top_k=5 mode=precomputed
```

## 八、为什么这种方案有效

向量检索擅长找“语义相近”，但不一定能保证“主题一致”。

例如：

```text
老年人接种流感疫苗
老年人高血压长期用药
```

这两句话都包含“老年人”“健康”“管理”等语义，向量距离可能很近。但对“流感疫苗文章”来说，第二条明显跑题。

本方案先用结构化实体关系保证主题边界，再用向量检索做相似度排序：

```text
结构化过滤保证不跑题
向量召回保证内容相关性排序
```

这比单纯向量召回更稳定，也比纯关键词检索更灵活。

## 九、后续可继续优化方向

1. 增加召回结果评分解释，例如显示命中的实体词、别名词和相似度分数。
2. 对人群/场景片段增加结构化关联表，不只依赖内容包含实体词。
3. 对生成文章的引用片段做可视化，方便编辑人员判断知识来源。
4. 引入 rerank 模型，对过滤后的候选片段再次排序。
5. 统计真实线上数据的命中率、噪声率、用户修改率，持续评估 RAG 效果。

## 十、关键代码位置

| 模块 | 文件 | 作用 |
|---|---|---|
| Agent | `cdc-agent/app/tools/rag_retrieval.py` | 分层过滤、增强 query、向量召回 |
| Agent | `cdc-agent/app/workflow/nodes.py` | 生成流程中调用 RAG 检索 |
| Agent | `cdc-agent/app/api/agent.py` | Agent API 中调用统一检索逻辑 |
| Agent | `cdc-agent/tests/test_rag_retrieval.py` | 模拟数据测试 |
| 后端 | `cdc-backend/src/main/java/com/cdc/cdcbackend/agent/AgentClient.java` | 向 Agent 传递实体和片段类型 |
| 后端 | `cdc-backend/src/main/java/com/cdc/cdcbackend/service/impl/ArticleServiceImpl.java` | 实体解析、别名匹配、降级逻辑 |
| 后端 | `cdc-backend/src/main/resources/mapper/WikiEntityMapper.xml` | 标准名、别名、模糊搜索 |
| 后端 | `cdc-backend/src/main/resources/mapper/WikiSegmentMapper.xml` | 查询片段时补充实体类型 |
| 后端测试 | `cdc-backend/src/test/java/com/cdc/cdcbackend/service/impl/ArticleServiceImplRagTest.java` | 实体解析测试 |
