/* ================================================================
   CDC 科普平台 — 模拟种子数据
   覆盖：文章、知识库、模板、LLM 配置、图片、修改历史、Agent Trace
   ================================================================ */

let nextArticleId = 100;
let nextModId = 1000;
let nextTraceId = 2000;
let nextImageId = 3000;
let nextWikiId = 400;
let nextSegmentId = 500;
let nextRuleId = 600;
let nextRelationId = 700;
let nextTemplateId = 50;
let nextLlmConfigId = 80;
let nextRequestId = 900;

const uid = (prefix) => {
  switch (prefix) {
    case 'article': return nextArticleId++;
    case 'mod': return nextModId++;
    case 'trace': return nextTraceId++;
    case 'image': return nextImageId++;
    case 'wiki': return nextWikiId++;
    case 'segment': return nextSegmentId++;
    case 'rule': return nextRuleId++;
    case 'relation': return nextRelationId++;
    case 'template': return nextTemplateId++;
    case 'llm': return nextLlmConfigId++;
    case 'request': return nextRequestId++;
    default: return Date.now();
  }
};

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ── 知识库实体 ── */
const wikiEntities = [
  { id: 1, entityType: 1, stdName: 'HPV（人乳头瘤病毒）', alias: 'HPV,人乳头瘤病毒', summary: 'HPV是一种常见的性传播病毒，已知有200多种亚型。高危型HPV（如16、18型）持续感染可导致宫颈癌等恶性肿瘤。', createTime: '2024-01-15 10:00:00', updateTime: '2024-06-10 14:30:00' },
  { id: 2, entityType: 1, stdName: '流感病毒', alias: '流感,流行性感冒', summary: '流感病毒是引起流行性感冒的病原体，分为甲、乙、丙三型。甲型流感病毒变异性强，可引起大流行。', createTime: '2024-02-01 09:00:00', updateTime: '2024-05-20 11:00:00' },
  { id: 3, entityType: 2, stdName: 'HPV疫苗', alias: '宫颈癌疫苗,九价疫苗', summary: 'HPV疫苗是预防HPV感染的有效手段。目前有二价、四价和九价疫苗可供选择，建议9-45岁女性接种。', createTime: '2024-01-20 10:00:00', updateTime: '2024-06-01 16:00:00' },
  { id: 4, entityType: 2, stdName: '流感疫苗', alias: '季节性流感疫苗', summary: '流感疫苗每年接种一次，是预防流感最有效的方法。推荐老年人、儿童、慢性病患者优先接种。', createTime: '2024-02-10 09:00:00', updateTime: '2024-05-15 10:00:00' },
  { id: 5, entityType: 3, stdName: '青少年', alias: '中学生,12-18岁', summary: '青少年时期是免疫系统发育的关键阶段，适合接种HPV疫苗等获得长期保护。', createTime: '2024-03-01 10:00:00', updateTime: '2024-03-01 10:00:00' },
  { id: 6, entityType: 3, stdName: '老年人', alias: '60岁以上,老龄人群', summary: '老年人免疫功能下降，是流感等呼吸道传染病的高危人群，建议每年接种流感疫苗。', createTime: '2024-03-05 09:00:00', updateTime: '2024-03-05 09:00:00' },
  { id: 7, entityType: 4, stdName: '校园接种', alias: '学校接种,集体接种', summary: '在学校组织集体接种可以提高接种覆盖率，减少排队等候时间。', createTime: '2024-04-01 10:00:00', updateTime: '2024-04-01 10:00:00' },
  { id: 8, entityType: 4, stdName: '社区接种', alias: '社区卫生服务中心', summary: '社区接种点是最便捷的疫苗接种渠道，适合各年龄段人群。', createTime: '2024-04-05 09:00:00', updateTime: '2024-04-05 09:00:00' },
];

/* ── 知识库片段（RAG 用） ── */
const wikiSegments = [
  { id: 1, entityId: 1, content: 'HPV（人乳头瘤病毒）主要通过性接触传播，是目前最常见的性传播感染。全球约80%的性活跃人群在一生中至少感染过一次HPV。大多数HPV感染可在1-2年内自行清除，但持续感染高危型HPV可导致宫颈癌前病变和宫颈癌。', source: 'WHO官方指南', createTime: '2024-01-15 10:00:00' },
  { id: 2, entityId: 1, content: '目前已知HPV有200多种亚型，其中约40种可感染生殖道。高危型包括HPV 16、18、31、33、45等，与宫颈癌、肛门癌等恶性肿瘤相关。低危型HPV 6和11主要引起生殖器疣。', source: '医学教科书', createTime: '2024-01-15 10:30:00' },
  { id: 3, entityId: 3, content: 'HPV疫苗通过预防HPV感染来降低宫颈癌风险。二价疫苗覆盖HPV 16/18型，可预防约70%的宫颈癌；四价疫苗额外覆盖HPV 6/11型（生殖器疣）；九价疫苗覆盖9种高危型，预防范围更广。', source: '疫苗学专著', createTime: '2024-01-20 10:00:00' },
  { id: 4, entityId: 3, content: 'WHO推荐9-14岁女孩作为HPV疫苗的首要接种人群，因为该年龄段免疫应答最强且在性行为开始前接种效果最佳。我国已批准二价、四价和九价HPV疫苗用于9-45岁女性。', source: '国家免疫规划', createTime: '2024-01-20 11:00:00' },
  { id: 5, entityId: 2, content: '流行性感冒（流感）是由流感病毒引起的急性呼吸道传染病，每年在全球导致300-500万重症病例和29-65万死亡。流感与普通感冒不同，起病急、症状重，可出现高热、全身酸痛、乏力等。', source: 'CDC流感监测报告', createTime: '2024-02-01 09:00:00' },
  { id: 6, entityId: 4, content: '季节性流感疫苗每年需更新毒株组成，因为流感病毒不断变异。北半球通常在每年9-11月接种，保护期约6-8个月。老年人、慢性病患者和医务人员是优先接种人群。', source: '中国流感疫苗接种指南', createTime: '2024-02-10 09:00:00' },
];

/* ── 知识库规则 ── */
const wikiRules = [
  { id: 1, ruleType: 'MustInclude', content: '必须提及疫苗接种的适宜年龄范围', applyEntityIds: '1,3', status: 1, createTime: '2024-05-01 10:00:00' },
  { id: 2, ruleType: 'MustInclude', content: '必须说明疫苗接种的安全性数据', applyEntityIds: '1,2,3,4', status: 1, createTime: '2024-05-01 10:30:00' },
  { id: 3, ruleType: 'MustNotSay', content: '不得使用"100%有效"等绝对化表述', applyEntityIds: '1,2,3,4', status: 1, createTime: '2024-05-01 11:00:00' },
  { id: 4, ruleType: 'MustInclude', content: '必须引用权威来源（WHO、国家CDC等）', applyEntityIds: '1,2,3,4', status: 1, createTime: '2024-05-01 11:30:00' },
  { id: 5, ruleType: 'MustNotSay', content: '不得推荐未经批准的疫苗产品', applyEntityIds: '1,2,3,4', status: 1, createTime: '2024-05-01 12:00:00' },
];

/* ── 知识库关系 ── */
const wikiRelations = [
  { id: 1, fromEid: 1, toEid: 3, relType: 'prevented_by' },
  { id: 2, fromEid: 2, toEid: 4, relType: 'prevented_by' },
  { id: 3, fromEid: 3, toEid: 5, relType: 'target_population' },
  { id: 4, fromEid: 4, toEid: 6, relType: 'target_population' },
  { id: 5, fromEid: 3, toEid: 7, relType: 'applied_scene' },
  { id: 6, fromEid: 4, toEid: 8, relType: 'applied_scene' },
];

/* ── 文章模板 ── */
const templates = [
  {
    id: 1, templateName: '疫苗科普标准模板', tag: 'vaccine',
    purpose: '向公众普及疫苗知识，消除接种疑虑',
    tone: JSON.stringify(['专业严谨', '通俗易懂', '温和关怀']),
    outlineStructure: JSON.stringify([
      { title: '什么是{entity}？', children: ['定义与基本概念', '发病机制简述'] },
      { title: '{entity}疫苗如何起作用', children: ['疫苗原理', '免疫机制'] },
      { title: '谁应该接种？', children: ['推荐人群', '接种时间建议'] },
      { title: '接种注意事项', children: ['接种前准备', '可能的不良反应', '禁忌人群'] },
      { title: '常见误区澄清', children: ['网络谣言辨析', '科学依据'] },
      { title: '总结与建议', children: [] }
    ]),
    status: 1, createTime: '2024-01-10 10:00:00'
  },
  {
    id: 2, templateName: '传染病防控指南', tag: 'disease',
    purpose: '介绍传染病的防控知识，指导公众科学防护',
    tone: JSON.stringify(['权威准确', '实用导向']),
    outlineStructure: JSON.stringify([
      { title: '{entity}概述', children: ['病原体特征', '传播途径'] },
      { title: '临床表现与诊断', children: ['典型症状', '诊断方法'] },
      { title: '预防措施', children: ['个人防护', '环境卫生', '疫苗接种'] },
      { title: '治疗与康复', children: ['治疗方法', '康复指导'] },
      { title: '公共卫生建议', children: [] }
    ]),
    status: 1, createTime: '2024-02-05 10:00:00'
  },
  {
    id: 3, templateName: '健康科普短文', tag: 'general',
    purpose: '以轻松的方式传播健康知识',
    tone: JSON.stringify(['轻松有趣', '生活化', '故事性']),
    outlineStructure: JSON.stringify([
      { title: '引子：从一个故事说起', children: [] },
      { title: '你需要知道的真相', children: ['常见误解', '科学解释'] },
      { title: '日常生活中的实用建议', children: [] },
      { title: '专家说', children: [] },
    ]),
    status: 1, createTime: '2024-03-01 10:00:00'
  },
];

/* ── LLM 配置 ── */
const llmConfigs = [
  { id: 1, configName: 'Qwen-Turbo 文章生成', configType: 'text_generation', provider: 'dashscope', modelName: 'qwen-turbo', apiKeyEncrypted: '***', baseUrl: '', params: '{"temperature":0.7,"max_tokens":4096}', isDefault: 1, isEnabled: 1, description: '主力生成模型，性价比高', createdAt: '2024-01-01 00:00:00', updatedAt: '2024-06-01 00:00:00' },
  { id: 2, configName: 'Qwen-Max 高质量生成', configType: 'text_generation', provider: 'dashscope', modelName: 'qwen-max', apiKeyEncrypted: '***', baseUrl: '', params: '{"temperature":0.5,"max_tokens":8192}', isDefault: 0, isEnabled: 1, description: '高质量文章生成备用', createdAt: '2024-01-01 00:00:00', updatedAt: '2024-06-01 00:00:00' },
  { id: 3, configName: 'Text-Embedding-V2', configType: 'embedding', provider: 'dashscope', modelName: 'text-embedding-v2', apiKeyEncrypted: '***', baseUrl: '', params: '{"dimensions":1536}', isDefault: 1, isEnabled: 1, description: '向量嵌入模型', createdAt: '2024-01-01 00:00:00', updatedAt: '2024-06-01 00:00:00' },
  { id: 4, configName: 'Qwen-Turbo 事实核查', configType: 'fact_check', provider: 'dashscope', modelName: 'qwen-turbo', apiKeyEncrypted: '***', baseUrl: '', params: '{"temperature":0.1,"max_tokens":2048}', isDefault: 1, isEnabled: 1, description: '事实核查专用', createdAt: '2024-01-01 00:00:00', updatedAt: '2024-06-01 00:00:00' },
];

/* ── 文章列表（含各种状态） ── */
const articles = [
  {
    id: 1, requestId: 1, templateId: 1, status: 5,
    outline: '# HPV疫苗科普\n## 什么是HPV？\n## HPV疫苗如何工作\n## 谁应该接种\n## 常见误区',
    initialDraft: '# HPV疫苗：你需要知道的一切\n\n## 什么是HPV？\n\nHPV（人乳头瘤病毒）是一种...',
    finalArticle: '# HPV疫苗：守护健康的科学盾牌\n\n## 一、认识HPV：不只是"一种病毒"\n\nHPV（人乳头瘤病毒）是世界上最常见的性传播感染...',
    entityName: 'HPV疫苗', entityType: 2, mode: 1, userText: '',
    coverImage: '', images: '[]', qualityScore: 0.92, readabilityLevel: 'easy',
    generationMeta: '{"total_cost_ms":15230}',
    createTime: '2024-06-01 10:00:00', updateTime: '2024-06-01 11:30:00',
    templateName: '疫苗科普标准模板', modifyCount: 5
  },
  {
    id: 2, requestId: 2, templateId: 2, status: 3,
    outline: '# 流感防控指南\n## 流感病毒概述\n## 临床表现\n## 预防措施\n## 疫苗接种',
    initialDraft: '# 科学认识流感，守护家人健康\n\n## 流感不是"大号感冒"\n\n很多人觉得流感就是...',
    finalArticle: '',
    entityName: '流感病毒', entityType: 1, mode: 1, userText: '',
    coverImage: '', images: '[]', qualityScore: 0.85, readabilityLevel: 'easy',
    generationMeta: '{"total_cost_ms":12100}',
    createTime: '2024-06-10 14:00:00', updateTime: '2024-06-10 15:00:00',
    templateName: '传染病防控指南', modifyCount: 3
  },
  {
    id: 3, requestId: 3, templateId: 1, status: 2,
    outline: '# 儿童HPV疫苗\n## 为什么儿童需要接种\n## 最佳接种年龄\n## 安全性数据',
    initialDraft: '',
    finalArticle: '',
    entityName: 'HPV疫苗', entityType: 2, mode: 1, userText: '',
    coverImage: '', images: '[]', qualityScore: null, readabilityLevel: null,
    generationMeta: '',
    createTime: '2024-06-15 09:00:00', updateTime: '2024-06-15 09:30:00',
    templateName: '疫苗科普标准模板', modifyCount: 1
  },
  {
    id: 4, requestId: 4, templateId: 3, status: 1,
    outline: '', initialDraft: '', finalArticle: '',
    entityName: '老年人', entityType: 3, mode: 2, userText: '写一篇关于老年人流感防护的科普短文',
    coverImage: '', images: '[]', qualityScore: null, readabilityLevel: null,
    generationMeta: '',
    createTime: '2024-06-18 16:00:00', updateTime: '2024-06-18 16:00:00',
    templateName: '健康科普短文', modifyCount: 0
  },
];

/* ── 修改历史 ── */
const modifications = [
  { id: 1, articleId: 1, modifyType: 'outline', operationType: 'ai_generate', beforeContent: '', afterContent: '# HPV疫苗科普\n## 什么是HPV？\n...', modifyTime: '2024-06-01 10:05:00' },
  { id: 2, articleId: 1, modifyType: 'outline', operationType: 'manual_edit', beforeContent: '# HPV疫苗科普\n## 什么是HPV？', afterContent: '# HPV疫苗科普\n## 什么是HPV？\n## HPV疫苗如何工作', modifyTime: '2024-06-01 10:10:00' },
  { id: 3, articleId: 1, modifyType: 'initial_draft', operationType: 'ai_generate', beforeContent: '', afterContent: '# HPV疫苗：你需要知道的一切\n\n## 什么是HPV？...', modifyTime: '2024-06-01 10:20:00' },
  { id: 4, articleId: 1, modifyType: 'initial_draft', operationType: 'manual_edit', beforeContent: '...第一版初稿...', afterContent: '...修改后的初稿...', modifyTime: '2024-06-01 10:45:00' },
  { id: 5, articleId: 1, modifyType: 'final_article', operationType: 'ai_generate', beforeContent: '', afterContent: '# HPV疫苗：守护健康的科学盾牌...', modifyTime: '2024-06-01 11:00:00' },
  { id: 6, articleId: 2, modifyType: 'outline', operationType: 'ai_generate', beforeContent: '', afterContent: '# 流感防控指南\n## 流感病毒概述...', modifyTime: '2024-06-10 14:05:00' },
  { id: 7, articleId: 2, modifyType: 'initial_draft', operationType: 'ai_generate', beforeContent: '', afterContent: '# 科学认识流感...', modifyTime: '2024-06-10 14:30:00' },
  { id: 8, articleId: 3, modifyType: 'outline', operationType: 'ai_generate', beforeContent: '', afterContent: '# 儿童HPV疫苗...', modifyTime: '2024-06-15 09:10:00' },
];

/* ── Agent 执行轨迹 ── */
const traces = [
  { id: 1, articleId: 1, stepName: 'knowledge_retrieval', stepContent: '检索到12条相关知识片段', costTime: 1200, modelUsed: 'text-embedding-v2', tokenUsage: '{"total":500}', qualityMetrics: '{}', createTime: '2024-06-01 10:02:00' },
  { id: 2, articleId: 1, stepName: 'outline_generation', stepContent: '生成6节大纲结构', costTime: 3500, modelUsed: 'qwen-turbo', tokenUsage: '{"prompt":200,"completion":800}', qualityMetrics: '{}', createTime: '2024-06-01 10:02:04' },
  { id: 3, articleId: 1, stepName: 'fact_check', stepContent: '事实核查通过，8/8条声明有据', costTime: 2800, modelUsed: 'qwen-turbo', tokenUsage: '{"prompt":1200,"completion":400}', qualityMetrics: '{"fact_check_passed":true}', createTime: '2024-06-01 10:02:07' },
  { id: 4, articleId: 1, stepName: 'draft_generation', stepContent: '生成完整初稿，约1200字', costTime: 8500, modelUsed: 'qwen-turbo', tokenUsage: '{"prompt":3000,"completion":2500}', qualityMetrics: '{}', createTime: '2024-06-01 10:02:16' },
  { id: 5, articleId: 1, stepName: 'rule_check', stepContent: '规则检查通过', costTime: 1500, modelUsed: 'qwen-turbo', tokenUsage: '{"prompt":1500,"completion":200}', qualityMetrics: '{"rule_check_passed":true}', createTime: '2024-06-01 10:02:18' },
];

/* ── 文章图片 ── */
const articleImages = [
  { id: 1, articleId: 1, imageKey: 'img_001', filePath: '/uploads/images/img_1781853178721_001.jpg', caption: 'HPV病毒结构示意图', position: 1, generatedBy: 'wanx-v1', generationPrompt: 'HPV virus structure diagram', width: 1024, height: 768, fileSize: 156000, status: 1, createdAt: '2024-06-01 11:00:00', updatedAt: '2024-06-01 11:00:00' },
  { id: 2, articleId: 1, imageKey: 'img_002', filePath: '/uploads/images/img_1781853178721_002.jpg', caption: '疫苗接种场景', position: 3, generatedBy: 'wanx-v1', generationPrompt: 'vaccination scene in clinic', width: 1024, height: 768, fileSize: 143000, status: 1, createdAt: '2024-06-01 11:00:00', updatedAt: '2024-06-01 11:00:00' },
];

/* ── 表单下拉数据 ── */
const formDropdown = {
  diseaseList: wikiEntities.filter(e => e.entityType === 1),
  vaccineList: wikiEntities.filter(e => e.entityType === 2),
  populationList: wikiEntities.filter(e => e.entityType === 3),
  sceneList: wikiEntities.filter(e => e.entityType === 4),
  templateList: templates,
};

/* ── 模拟生成的大纲 ── */
const mockOutline = `# HPV疫苗：守护健康的科学盾牌

## 一、认识HPV：不只是"一种病毒"
### 1.1 什么是HPV
### 1.2 高危型与低危型的区别
### 1.3 感染率与传播途径

## 二、HPV疫苗：科学防护的利器
### 2.1 疫苗的工作原理
### 2.2 二价、四价、九价有何不同
### 2.3 保护效果数据

## 三、谁应该接种？
### 3.1 推荐接种人群
### 3.2 最佳接种年龄
### 3.3 男性是否也需要接种

## 四、接种注意事项
### 4.1 接种前你需要知道的
### 4.2 可能的不良反应
### 4.3 哪些人不适合接种

## 五、常见误区澄清
### 5.1 "打了疫苗就不会得宫颈癌"——真相是什么？
### 5.2 "疫苗有副作用，不安全"——科学怎么看？

## 六、总结：科学认知，理性选择`;

/* ── 模拟生成的初稿 ── */
const mockDraft = `# HPV疫苗：守护健康的科学盾牌

## 一、认识HPV：不只是"一种病毒"

提到HPV，很多人的第一反应可能是"那个和宫颈癌有关的病毒"。这个认知没有错，但HPV的故事远不止于此。

HPV，全称"人乳头瘤病毒"（Human Papillomavirus），是世界上最常见的性传播感染[ref:1]。据统计，全球约80%的性活跃人群在一生中至少会感染一次HPV。好消息是，绝大多数感染会在1-2年内被人体免疫系统自行清除，不会造成任何健康问题。

然而，当某些"高危型"HPV持续感染时，情况就不同了。目前已知的HPV有200多种亚型，其中约15种被归类为高危型[ref:2]。HPV 16型和18型是最常见的高危型，它们与约70%的宫颈癌病例相关。而低危型的HPV 6和11型虽然不会致癌，但可引起生殖器疣，同样影响生活质量。

## 二、HPV疫苗：科学防护的利器

HPV疫苗的问世是公共卫生领域的重大突破。它的原理并不复杂——通过引入HPV病毒的外壳蛋白（病毒样颗粒），训练免疫系统识别和记住这种病毒，当真正的HPV入侵时，身体就能迅速发起防御[ref:3]。

目前市面上有三种HPV疫苗：

- **二价疫苗**：覆盖HPV 16和18型，可预防约70%的宫颈癌
- **四价疫苗**：在二价基础上增加HPV 6和11型，额外预防生殖器疣
- **九价疫苗**：覆盖9种高危型，预防范围最广，可预防约90%的宫颈癌

三种疫苗都经过了严格的临床试验验证，安全性和有效性均得到了充分证实[ref:4]。

## 三、谁应该接种？

世界卫生组织（WHO）推荐**9-14岁女孩**作为首要接种人群。这个年龄段有两个优势：一是免疫应答最强，二是通常在性行为开始之前接种，能获得最佳保护效果。

在我国，已批准的HPV疫苗适用于**9-45岁女性**。虽然越早接种越好，但即使已有性经历，接种疫苗仍然有意义——因为你很可能尚未接触到疫苗覆盖的所有HPV亚型。

近年来，越来越多的研究也关注到**男性接种**的价值。虽然目前我国尚未批准男性接种，但在澳大利亚、美国等国家，男性接种HPV疫苗已成为常规推荐。

## 四、接种注意事项

**接种前**，建议告知医生你的过敏史、当前健康状况和是否怀孕。HPV疫苗不建议在孕期接种，但如果在不知怀孕的情况下接种了，也不必过度担心——目前没有证据表明会对胎儿造成危害。

HPV疫苗的安全性已经过全球数亿剂次接种的验证。最常见的不良反应是接种部位疼痛、红肿，通常在1-2天内自行消退。少数人可能出现轻微发热、头痛或疲劳，这些都是免疫系统正常应答的表现[ref:5]。

以下人群应暂缓或避免接种：对疫苗成分严重过敏者、正在发热或急性疾病期间的人群。

## 五、常见误区澄清

**误区一："打了疫苗就不会得宫颈癌了"**

事实：HPV疫苗虽然能预防大部分高危型HPV感染，但并非100%覆盖所有亚型。因此，即使接种了疫苗，仍然需要定期进行宫颈癌筛查。疫苗和筛查是互补的两道防线。

**误区二："疫苗有严重副作用"**

事实：关于HPV疫苗"副作用严重"的说法大多缺乏科学证据支持。全球大规模监测数据显示，HPV疫苗的安全性与其他常规疫苗一致。个别不良反应的报道需要放在"数百万剂次接种"的大背景下来看——任何医学干预都不可能完全零风险，但HPV疫苗的获益远大于风险。

## 六、总结：科学认知，理性选择

HPV疫苗是现代医学为人类健康提供的一把"保护伞"。它不能消除所有风险，但能显著降低HPV相关疾病的发生概率。面对疫苗，我们需要的是科学认知而非恐惧，是理性选择而非盲从。

如果你或你的家人正处于适宜接种的年龄段，不妨咨询专业医生，做出最适合自己的健康决策。毕竟，预防永远胜于治疗。

> 参考来源：
> [1] WHO HPV and cervical cancer fact sheet
> [2] 《中国子宫颈癌综合防控指南》
> [3] HPV疫苗临床试验综述
> [4] 国家药品监督管理局HPV疫苗审批公告
> [5] CDC Vaccine Safety Datalink`;

/* ── 模拟 Agent 生成响应 ── */
const mockAgentOutlineResponse = {
  content: mockOutline,
  images: [],
  quality_metrics: { fact_check_passed: true, rule_check_passed: true, retry_count: 0 },
  trace: [
    { step_name: 'knowledge_retrieval', status: 'success', cost_ms: 800, detail: '检索到8条知识库片段' },
    { step_name: 'outline_planning', status: 'success', cost_ms: 2200, detail: '生成6节大纲结构' },
    { step_name: 'fact_check', status: 'success', cost_ms: 1500, detail: '事实核查通过' },
    { step_name: 'rule_check', status: 'success', cost_ms: 900, detail: '规则检查通过' },
  ],
  token_usage: { prompt_tokens: 1200, completion_tokens: 800, total_tokens: 2000, estimated_cost: 0.012 },
  generation_meta: { total_cost_ms: 5400, content_length: mockOutline.length }
};

const mockAgentDraftResponse = {
  content: mockDraft,
  images: [],
  quality_metrics: { fact_check_passed: true, rule_check_passed: true, retry_count: 0 },
  trace: [
    { step_name: 'knowledge_retrieval', status: 'success', cost_ms: 900, detail: '检索到12条知识库片段' },
    { step_name: 'draft_writing', status: 'success', cost_ms: 8500, detail: '生成完整初稿，约1200字' },
    { step_name: 'fact_check', status: 'success', cost_ms: 2100, detail: '事实核查通过，8/8条声明有据' },
    { step_name: 'rule_check', status: 'success', cost_ms: 1200, detail: '规则检查通过' },
    { step_name: 'quality_review', status: 'success', cost_ms: 1800, detail: '质量评分: 0.89' },
  ],
  token_usage: { prompt_tokens: 3500, completion_tokens: 2800, total_tokens: 6300, estimated_cost: 0.038 },
  generation_meta: { total_cost_ms: 14500, content_length: mockDraft.length }
};

/* ── 知识库片段向量嵌入 ── */
const wikiSegmentEmbeddings = [
  { id: 1, segmentId: 1, entityId: 1, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
  { id: 2, segmentId: 2, entityId: 1, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
  { id: 3, segmentId: 3, entityId: 3, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
  { id: 4, segmentId: 4, entityId: 3, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
  { id: 5, segmentId: 5, entityId: 2, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
  { id: 6, segmentId: 6, entityId: 4, embedding: JSON.stringify(Array.from({length:8}, ()=>+(Math.random()*2-1).toFixed(4))), dimensions: 1536, modelVersion: 'text-embedding-v2' },
];

/* ── 模拟 parse-intent 响应（BUG-NEW-2 测试用） ── */
const mockParseIntentResponse = {
  entity_type: 'disease',
  entity_name: '流感',
  population_name: '老年人',
  scene_name: '社区接种',
  word_count: 800,
};

/* ── 模拟 Agent 错误响应（BUG-NEW-6 测试用） ── */
const mockAgentErrorResponse = {
  detail: 'LLMError: LLM调用失败: rate limit exceeded',
};

/* ── 模拟图片生成响应（更完整版本） ── */
const mockImageGenResponse = {
  sections: [
    { index: 1, title: '认识HPV', needs_image: true },
    { index: 3, title: '谁应该接种', needs_image: true },
    { index: 5, title: '常见误区', needs_image: false },
  ],
  images: [
    { section_index: 1, caption: 'HPV病毒结构示意图', file_path: '/uploads/images/mock_hpv_structure.jpg', prompt: 'HPV virus structure', width: 1024, height: 768, file_size: 156000 },
    { section_index: 3, caption: '疫苗接种场景', file_path: '/uploads/images/mock_vaccination.jpg', prompt: 'vaccination scene', width: 1024, height: 768, file_size: 143000 },
  ],
  total: 2,
};

module.exports = {
  wikiEntities, wikiSegments, wikiRules, wikiRelations, wikiSegmentEmbeddings,
  templates, llmConfigs, articles, modifications, traces, articleImages,
  formDropdown, mockOutline, mockDraft,
  mockAgentOutlineResponse, mockAgentDraftResponse,
  mockParseIntentResponse, mockAgentErrorResponse, mockImageGenResponse,
  uid, now,
};
