/* ================================================================
   CDC 科普平台 — Mock Server v2
   模拟 Java Backend + Python Agent + Test Control
   端口 3001，与前端 Vite proxy 规则匹配
   
   启动：node mock-server.js
   ================================================================ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  wikiEntities, wikiSegments, wikiRules, wikiRelations,
  templates, llmConfigs, articles, modifications, traces, articleImages,
  formDropdown, mockOutline, mockDraft,
  mockAgentOutlineResponse, mockAgentDraftResponse,
  wikiSegmentEmbeddings, mockParseIntentResponse, mockAgentErrorResponse, mockImageGenResponse,
  uid, now,
} = require('./seed-data.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb', strict: false }));
app.use(express.text({ type: 'application/json' }));

/* ── 内存数据副本（支持 CRUD 操作）── */
const db = {
  articles: JSON.parse(JSON.stringify(articles)),
  modifications: JSON.parse(JSON.stringify(modifications)),
  traces: JSON.parse(JSON.stringify(traces)),
  images: JSON.parse(JSON.stringify(articleImages)),
  wikiEntities: JSON.parse(JSON.stringify(wikiEntities)),
  wikiSegments: JSON.parse(JSON.stringify(wikiSegments)),
  wikiRules: JSON.parse(JSON.stringify(wikiRules)),
  wikiRelations: JSON.parse(JSON.stringify(wikiRelations)),
  segmentEmbeddings: JSON.parse(JSON.stringify(wikiSegmentEmbeddings)),
  templates: JSON.parse(JSON.stringify(templates)),
  llmConfigs: JSON.parse(JSON.stringify(llmConfigs)),
  requests: [],  // 表单提交记录
};

/* ── Bug 模拟开关（默认关闭 = 修复后行为）── */
const bugs = {
  wikiRuleEntityId: false,     // BUG-NEW-1: WikiRule INSERT 丢失 entityId
  parseIntParam: false,        // BUG-NEW-2: parse-intent 参数绑定不匹配
  confirmFinalNoCheck: false,  // BUG-NEW-3: confirmFinal 不检查 null
  npeOnMissingArticle: false,  // BUG-NEW-4: 不存在文章 NPE
  duplicateModRecord: false,   // BUG-NEW-5: regenerateOutline 重复记录
  agentErrorAsContent: false,  // BUG-NEW-6: Agent 错误信息存为内容
  revertToNull: false,         // BUG-NEW-9: 回退到 null 内容
  negativeOffset: false,       // BUG-NEW-11: 分页负 offset
  incompleteCascade: false,    // BUG-NEW-12: 删除级联不完整
};

/* ── 响应工具 ── */
const ok = (data) => ({ code: 200, msg: 'success', data });
const err = (msg, code = 500) => ({ code, msg, data: null });

const paginate = (list, page = 1, size = 10) => {
  const p = bugs.negativeOffset ? Number(page) : Math.max(1, Number(page));
  const s = Math.max(1, Number(size));
  const start = (p - 1) * s;
  return {
    list: list.slice(Math.max(0, start), Math.max(0, start) + s),
    total: list.length,
    page: p,
    size: s,
    totalPages: Math.ceil(list.length / s),
  };
};

/* ── 辅助：查找文章，按 bug 开关返回不同错误 ── */
const findArticleOrError = (id, res) => {
  const article = db.articles.find(a => a.id === Number(id));
  if (!article) {
    if (bugs.npeOnMissingArticle) {
      // BUG-NEW-4: NPE-like 500 error instead of proper 404
      res.status(500).json(err('NullPointerException: Cannot read property "outline" of null'));
      return null;
    }
    res.status(404).json(err('文章不存在', 404));
    return null;
  }
  return article;
};

/* ── 请求日志 ── */
app.use((req, res, next) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${req.method.padEnd(6)} ${req.originalUrl}`);
  next();
});

/* ================================================================
   Test Control — Bug 模拟开关
   ================================================================ */

// Toggle a specific bug on/off
app.put('/api/test/toggle-bug/:name', (req, res) => {
  const { name } = req.params;
  const enable = req.body?.enable ?? !bugs[name];
  if (name in bugs) {
    bugs[name] = enable;
    res.json(ok({ [name]: bugs[name] }));
  } else {
    res.json(err('Unknown bug: ' + name, 404));
  }
});

// List all bugs and their current state
app.get('/api/test/bugs', (req, res) => {
  res.json(ok(bugs));
});

// Test helper: insert a custom modification record
app.post('/api/article/:id/_test-insert-mod', (req, res) => {
  const articleId = Number(req.params.id);
  const article = db.articles.find(a => a.id === articleId);
  if (!article) return res.status(404).json(err('文章不存在', 404));
  const mod = {
    id: uid('mod'), articleId,
    modifyType: req.body.modifyType || 'outline',
    operationType: req.body.operationType || 'test',
    beforeContent: 'beforeContent' in req.body ? req.body.beforeContent : '',
    afterContent: 'afterContent' in req.body ? req.body.afterContent : '',
    modifyTime: now(),
  };
  db.modifications.push(mod);
  res.json(ok(mod.id));
});

/* ================================================================
   Java Backend — Article 模块
   ================================================================ */

// 表单下拉数据
app.get('/api/article/form/dropdown', (req, res) => {
  res.json(ok(formDropdown));
});

// 创建文章（表单模式）
app.post('/api/article/generate', (req, res) => {
  const body = req.body;
  const id = uid('article');
  const reqId = uid('request');
  db.requests.push({ id: reqId, ...body, createTime: now() });
  const article = {
    id, requestId: reqId, templateId: body.templateId, status: 1,
    outline: '', initialDraft: '', finalArticle: '',
    entityName: body.entityId ? db.wikiEntities.find(e => e.id === body.entityId)?.stdName || '' : '',
    entityType: body.entityType || 1, mode: 1, userText: body.userText || '',
    coverImage: '', images: '[]', qualityScore: null, readabilityLevel: null,
    generationMeta: '', createTime: now(), updateTime: now(),
    templateName: db.templates.find(t => t.id === body.templateId)?.templateName || '',
    modifyCount: 0,
  };
  db.articles.push(article);
  res.json(ok({ articleId: id, status: 1, context: {} }));
});

// 创建文章（自由文本模式）
app.post('/api/article/generate/text', (req, res) => {
  const { userText, templateId } = req.body;
  const id = uid('article');
  const reqId = uid('request');
  db.requests.push({ id: reqId, mode: 2, userText, templateId, createTime: now() });
  const article = {
    id, requestId: reqId, templateId: templateId || 3, status: 1,
    outline: '', initialDraft: '', finalArticle: '',
    entityName: userText?.slice(0, 20) || '', entityType: 1, mode: 2, userText: userText || '',
    coverImage: '', images: '[]', qualityScore: null, readabilityLevel: null,
    generationMeta: '', createTime: now(), updateTime: now(),
    templateName: db.templates.find(t => t.id === (templateId || 3))?.templateName || '',
    modifyCount: 0,
  };
  db.articles.push(article);
  res.json(ok({ articleId: id, status: 1, context: {} }));
});

// 文章上下文
app.get('/api/article/context/:id', (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  const entity = db.wikiEntities.find(e => e.stdName === article.entityName);
  const segments = entity ? db.wikiSegments.filter(s => s.entityId === entity.id) : [];
  res.json(ok({
    entity: entity ? { id: entity.id, stdName: entity.stdName, alias: entity.alias, summary: entity.summary } : null,
    segments: segments.map(s => ({ id: s.id, entityId: s.entityId, content: s.content, source: s.source })),
    rules: db.wikiRules.filter(r => r.status === 1).map(r => r.content),
  }));
});

// 文章列表
app.get('/api/article/list', (req, res) => {
  res.json(ok(db.articles));
});

// 文章分页列表
app.get('/api/article/list/paged', (req, res) => {
  let list = [...db.articles];
  const { status, keyword } = req.query;
  if (status) list = list.filter(a => a.status === Number(status));
  if (keyword) list = list.filter(a =>
    (a.entityName || '').includes(keyword) ||
    (a.userText || '').includes(keyword) ||
    (a.templateName || '').includes(keyword)
  );
  list.sort((a, b) => b.id - a.id);
  res.json(ok(paginate(list, req.query.page, req.query.size)));
});

// 获取文章详情
app.get('/api/article/:id', (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  res.json(ok(article));
});

// 删除文章（BUG-NEW-12: 删除级联不完整）
app.delete('/api/article/:id', (req, res) => {
  const articleId = Number(req.params.id);
  const idx = db.articles.findIndex(a => a.id === articleId);
  if (idx === -1) return res.status(404).json(err('文章不存在', 404));
  db.articles.splice(idx, 1);

  // Always clean up modifications and traces
  db.modifications = db.modifications.filter(m => m.articleId !== articleId);
  db.traces = db.traces.filter(t => t.articleId !== articleId);

  if (!bugs.incompleteCascade) {
    // FIXED: Also clean up requests and images
    db.requests = db.requests.filter(r => r.id !== articleId);
    db.images = db.images.filter(i => i.articleId !== articleId);
  }
  // When bugs.incompleteCascade is true, requests and images are left orphaned

  res.json(ok(true));
});

// AI 生成大纲
app.post('/api/article/:id/generate-outline', async (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  // 模拟延迟
  await new Promise(r => setTimeout(r, 2000));
  article.outline = mockOutline;
  article.status = 2;
  article.updateTime = now();
  db.modifications.push({
    id: uid('mod'), articleId: article.id, modifyType: 'outline',
    operationType: 'ai_generate', beforeContent: '', afterContent: mockOutline, modifyTime: now(),
  });
  res.json(ok(mockOutline));
});

// AI 生成大纲 — 错误模拟端点 (BUG-NEW-6)
app.post('/api/article/:id/generate-outline-error', async (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  if (bugs.agentErrorAsContent) {
    // BUG: error message stored as content
    article.outline = 'Agent 服务异常: LLM调用失败: rate limit exceeded';
    article.status = 2;
    article.updateTime = now();
    res.json(ok(article.outline));
  } else {
    // FIXED: return proper error
    res.status(500).json(err('Agent 服务异常: LLM调用失败'));
  }
});

// AI 重新生成大纲（BUG-NEW-5: 重复修改记录）
app.post('/api/article/:id/regenerate-outline', async (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  await new Promise(r => setTimeout(r, 2000));
  const oldOutline = article.outline;
  article.outline = mockOutline + '\n\n## 七、附录：参考文献';
  article.updateTime = now();

  if (bugs.duplicateModRecord) {
    // BUG-NEW-5: insert TWO modification records
    db.modifications.push({
      id: uid('mod'), articleId: article.id, modifyType: 'outline',
      operationType: 'ai_regenerate', beforeContent: oldOutline, afterContent: article.outline, modifyTime: now(),
    });
    db.modifications.push({
      id: uid('mod'), articleId: article.id, modifyType: 'outline',
      operationType: 'ai_regenerate', beforeContent: oldOutline, afterContent: article.outline, modifyTime: now(),
    });
  } else {
    // FIXED: update existing record or insert one
    const existingMod = db.modifications.find(
      m => m.articleId === article.id && m.modifyType === 'outline' && m.operationType === 'ai_regenerate'
    );
    if (existingMod) {
      existingMod.beforeContent = oldOutline;
      existingMod.afterContent = article.outline;
      existingMod.modifyTime = now();
    } else {
      db.modifications.push({
        id: uid('mod'), articleId: article.id, modifyType: 'outline',
        operationType: 'ai_regenerate', beforeContent: oldOutline, afterContent: article.outline, modifyTime: now(),
      });
    }
  }
  res.json(ok(article.outline));
});

// 保存大纲（已修复：保留原 status，不再覆盖为 null）
app.put('/api/article/:id/outline', (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  let content = req.body;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { /* keep as is */ }
  }
  const oldOutline = article.outline;
  article.outline = content;
  // FIXED: preserve original status (simulates Service layer up.setStatus(old.getStatus()))
  article.updateTime = now();
  db.modifications.push({
    id: uid('mod'), articleId: article.id, modifyType: 'outline',
    operationType: 'manual_edit', beforeContent: oldOutline, afterContent: content, modifyTime: now(),
  });
  console.log(`  Article ${article.id} outline saved, status preserved as ${article.status}`);
  res.json(ok(true));
});

// 确认大纲
app.post('/api/article/:id/confirm-outline', (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  if (req.body) {
    let body = req.body;
    // Support both { content: "..." } and raw string body
    let content = (typeof body === 'object' && body !== null) ? (body.content || body) : body;
    if (typeof content === 'string') {
      try { const parsed = JSON.parse(content); content = parsed; } catch { /* keep raw string */ }
    }
    article.outline = content;
  }
  // status stays at 2 or restored to 2 (if previously overwritten by bug to null)
  if (article.status === null || article.status === 2) {
    article.status = 2;
  }
  article.updateTime = now();
  res.json(ok(true));
});

// AI 生成初稿
app.post('/api/article/:id/generate-draft', async (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  await new Promise(r => setTimeout(r, 3000));
  article.initialDraft = mockDraft;
  article.status = 3;
  article.updateTime = now();
  db.modifications.push({
    id: uid('mod'), articleId: article.id, modifyType: 'initial_draft',
    operationType: 'ai_generate', beforeContent: '', afterContent: mockDraft, modifyTime: now(),
  });
  // 添加模拟 trace
  mockAgentDraftResponse.trace.forEach(t => {
    db.traces.push({
      id: uid('trace'), articleId: article.id, stepName: t.step_name,
      stepContent: t.detail, costTime: t.cost_ms, modelUsed: 'qwen-turbo',
      tokenUsage: JSON.stringify({}), qualityMetrics: JSON.stringify({}), createTime: now(),
    });
  });
  res.json(ok(mockDraft));
});

// AI 重新生成初稿
app.post('/api/article/:id/regenerate-draft', async (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  await new Promise(r => setTimeout(r, 3000));
  const oldDraft = article.initialDraft;
  article.initialDraft = mockDraft + '\n\n---\n*本稿为重新生成版本*';
  article.updateTime = now();
  db.modifications.push({
    id: uid('mod'), articleId: article.id, modifyType: 'initial_draft',
    operationType: 'ai_regenerate', beforeContent: oldDraft, afterContent: article.initialDraft, modifyTime: now(),
  });
  res.json(ok(article.initialDraft));
});

// 保存初稿（已修复：保留原 status）
app.put('/api/article/:id/draft', (req, res) => {
  const article = findArticleOrError(req.params.id, res);
  if (!article) return;
  let content = req.body;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { /* keep as is */ }
  }
  const oldDraft = article.initialDraft;
  article.initialDraft = content;
  // FIXED: preserve original status
  article.updateTime = now();
  db.modifications.push({
    id: uid('mod'), articleId: article.id, modifyType: 'initial_draft',
    operationType: 'manual_edit', beforeContent: oldDraft, afterContent: content, modifyTime: now(),
  });
  console.log(`  Article ${article.id} draft saved, status preserved as ${article.status}`);
  res.json(ok(true));
});

// 确认初稿（初稿 → 终稿）
app.post('/api/article/:id/confirm-draft', (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  article.finalArticle = article.initialDraft;
  article.status = 4;
  article.updateTime = now();
  res.json(ok(true));
});

// 确认终稿（confirm-final）— BUG-NEW-3: confirmFinal 不检查 null
app.post('/api/article/:id/confirm', (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  if (bugs.confirmFinalNoCheck) {
    // BUG: no null check on initialDraft
    article.finalArticle = article.initialDraft;
    article.status = 5;
    article.updateTime = now();
    res.json(ok(true));
  } else {
    // FIXED: check for null
    if (!article.initialDraft) {
      return res.status(400).json(err('初稿为空，无法确认终稿'));
    }
    article.finalArticle = article.initialDraft;
    article.status = 5;
    article.updateTime = now();
    res.json(ok(true));
  }
});

// 自动保存
app.post('/api/article/:id/autosave', (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  const { field, content } = req.body;
  if (field === 'outline') article.outline = content;
  if (field === 'initialDraft' || field === 'draft') article.initialDraft = content;
  if (field === 'finalArticle') article.finalArticle = content;
  article.updateTime = now();
  res.json(ok(true));
});

// 版本回退（BUG-NEW-9: 回退到 null 内容）
app.post('/api/article/:id/revert', (req, res) => {
  const article = db.articles.find(a => a.id === Number(req.params.id));
  if (!article) return res.status(404).json(err('文章不存在', 404));
  const { modificationId } = req.body;
  const mod = db.modifications.find(m => m.id === Number(modificationId));
  if (!mod) return res.status(404).json(err('修改记录不存在', 404));

  if (bugs.revertToNull && (mod.beforeContent === null || mod.beforeContent === '' || mod.beforeContent === undefined)) {
    // BUG-NEW-9: revert to null/empty content when beforeContent is empty (first edit)
    if (mod.modifyType === 'outline') article.outline = null;
    if (mod.modifyType === 'initial_draft') article.initialDraft = null;
    if (mod.modifyType === 'final_article') article.finalArticle = null;
    article.updateTime = now();
    res.json(ok(true));
  } else if (!bugs.revertToNull && (mod.afterContent === null || mod.afterContent === undefined)) {
    // FIXED: check for null and return error
    return res.status(400).json(err('回退目标内容为空，无法执行回退'));
  } else {
    if (mod.modifyType === 'outline') article.outline = mod.afterContent;
    if (mod.modifyType === 'initial_draft') article.initialDraft = mod.afterContent;
    if (mod.modifyType === 'final_article') article.finalArticle = mod.afterContent;
    article.updateTime = now();
    res.json(ok(true));
  }
});

// 修改历史
app.get('/api/article/:id/modifications', (req, res) => {
  const mods = db.modifications.filter(m => m.articleId === Number(req.params.id));
  res.json(ok(mods));
});

// Agent 执行轨迹
app.get('/api/article/:id/trace', (req, res) => {
  const t = db.traces.filter(t => t.articleId === Number(req.params.id));
  res.json(ok(t));
});

// 表单记录
app.get('/api/article/record/:id', (req, res) => {
  const record = db.requests.find(r => r.id === Number(req.params.id));
  res.json(ok(record || null));
});
app.get('/api/article/record/list', (req, res) => {
  res.json(ok(db.requests));
});

/* ================================================================
   Java Backend — Template 模块
   ================================================================ */

app.get('/api/template/list', (req, res) => {
  res.json(ok(db.templates));
});
app.get('/api/template/list/paged', (req, res) => {
  res.json(ok(paginate(db.templates, req.query.page, req.query.size)));
});
app.get('/api/template/:id', (req, res) => {
  const t = db.templates.find(t => t.id === Number(req.params.id));
  if (!t) return res.status(404).json(err('模板不存在', 404));
  res.json(ok(t));
});
app.post('/api/template', (req, res) => {
  const t = { id: uid('template'), ...req.body, status: 1, createTime: now() };
  db.templates.push(t);
  res.json(ok(t.id));
});
app.put('/api/template/:id', (req, res) => {
  const idx = db.templates.findIndex(t => t.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('模板不存在', 404));
  db.templates[idx] = { ...db.templates[idx], ...req.body };
  res.json(ok(1));
});
app.delete('/api/template/:id', (req, res) => {
  db.templates = db.templates.filter(t => t.id !== Number(req.params.id));
  res.json(ok(1));
});

/* ================================================================
   Java Backend — LLM Config 模块
   ================================================================ */

app.get('/api/llm-config', (req, res) => { res.json(ok(db.llmConfigs)); });
app.get('/api/llm-config/type/:configType', (req, res) => {
  const list = db.llmConfigs.filter(c => c.configType === req.params.configType);
  res.json(ok(list));
});
app.get('/api/llm-config/default/:configType', (req, res) => {
  const c = db.llmConfigs.find(c => c.configType === req.params.configType && c.isDefault === 1);
  res.json(ok(c || null));
});
app.get('/api/llm-config/:id', (req, res) => {
  const c = db.llmConfigs.find(c => c.id === Number(req.params.id));
  res.json(ok(c || null));
});
app.post('/api/llm-config', (req, res) => {
  const c = { id: uid('llm'), ...req.body, createdAt: now(), updatedAt: now() };
  db.llmConfigs.push(c);
  res.json(ok(c));
});
app.put('/api/llm-config/:id', (req, res) => {
  const idx = db.llmConfigs.findIndex(c => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('配置不存在', 404));
  db.llmConfigs[idx] = { ...db.llmConfigs[idx], ...req.body, updatedAt: now() };
  res.json(ok(1));
});
app.delete('/api/llm-config/:id', (req, res) => {
  db.llmConfigs = db.llmConfigs.filter(c => c.id !== Number(req.params.id));
  res.json(ok(1));
});
app.put('/api/llm-config/:id/set-default', (req, res) => {
  const target = db.llmConfigs.find(c => c.id === Number(req.params.id));
  if (!target) return res.status(404).json(err('配置不存在', 404));
  db.llmConfigs.forEach(c => { if (c.configType === target.configType) c.isDefault = 0; });
  target.isDefault = 1;
  res.json(ok(1));
});

/* ================================================================
   Java Backend — Article Image 模块
   ================================================================ */

// 获取文章的所有图片
app.get('/api/article-image/article/:articleId', (req, res) => {
  const imgs = db.images.filter(i => i.articleId === Number(req.params.articleId) && i.status === 1);
  res.json(ok(imgs));
});

// 获取单个图片
app.get('/api/article-image/:id', (req, res) => {
  const img = db.images.find(i => i.id === Number(req.params.id));
  res.json(ok(img || null));
});

// 创建单个图片
app.post('/api/article-image', (req, res) => {
  const img = { id: uid('image'), ...req.body, status: 1, createdAt: now(), updatedAt: now() };
  db.images.push(img);
  res.json(ok(img));
});

// 批量创建图片
app.post('/api/article-image/batch', (req, res) => {
  const imgs = req.body.map(i => ({ id: uid('image'), ...i, status: 1, createdAt: now(), updatedAt: now() }));
  db.images.push(...imgs);
  res.json(ok(imgs));
});

// 更新图片
app.put('/api/article-image/:id', (req, res) => {
  const idx = db.images.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('图片不存在', 404));
  db.images[idx] = { ...db.images[idx], ...req.body, updatedAt: now() };
  res.json(ok(1));
});

// 删除图片（软删除）
app.delete('/api/article-image/:id', (req, res) => {
  const img = db.images.find(i => i.id === Number(req.params.id));
  if (img) img.status = 0;
  res.json(ok(1));
});

// 更新图片说明
app.put('/api/article-image/:id/caption', (req, res) => {
  const img = db.images.find(i => i.id === Number(req.params.id));
  if (!img) return res.status(404).json(err('图片不存在', 404));
  img.caption = req.body.caption || req.query.caption || '';
  img.updatedAt = now();
  res.json(ok(1));
});

/* ================================================================
   Java Backend — Wiki 模块
   ================================================================ */

app.get('/api/wiki/list', (req, res) => {
  const list = db.wikiEntities.map(e => ({
    ...e,
    segments: db.wikiSegments.filter(s => s.entityId === e.id).map(s => ({ id: s.id, content: s.content, source: s.source })),
    rules: db.wikiRules.filter(r => (r.applyEntityIds || '').split(',').includes(String(e.id))).map(r => ({ id: r.id, ruleType: r.ruleType, content: r.content })),
    relatedIds: db.wikiRelations.filter(r => r.fromEid === e.id).map(r => r.toEid),
  }));
  res.json(ok(list));
});

app.get('/api/wiki/list/paged', (req, res) => {
  let list = [...db.wikiEntities];
  const { type, keyword } = req.query;
  if (type) list = list.filter(e => e.entityType === Number(type));
  if (keyword) list = list.filter(e => e.stdName.includes(keyword) || (e.alias || '').includes(keyword));
  res.json(ok(paginate(list, req.query.page, req.query.size)));
});

app.get('/api/wiki/rule', (req, res) => {
  res.json(ok(db.wikiRules.filter(r => r.status === 1)));
});

app.get('/api/wiki/:id', (req, res) => {
  const e = db.wikiEntities.find(e => e.id === Number(req.params.id));
  if (!e) return res.status(404).json(err('实体不存在', 404));
  res.json(ok({
    ...e,
    segments: db.wikiSegments.filter(s => s.entityId === e.id),
    rules: db.wikiRules.filter(r => (r.applyEntityIds || '').split(',').includes(String(e.id))),
    relatedIds: db.wikiRelations.filter(r => r.fromEid === e.id).map(r => r.toEid),
  }));
});

app.post('/api/wiki', (req, res) => {
  const e = { id: uid('wiki'), ...req.body, createTime: now(), updateTime: now() };
  db.wikiEntities.push(e);
  res.json(ok(e.id));
});
app.put('/api/wiki/:id', (req, res) => {
  const idx = db.wikiEntities.findIndex(e => e.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('实体不存在', 404));
  db.wikiEntities[idx] = { ...db.wikiEntities[idx], ...req.body, updateTime: now() };
  res.json(ok(1));
});
app.delete('/api/wiki/:id', (req, res) => {
  db.wikiEntities = db.wikiEntities.filter(e => e.id !== Number(req.params.id));
  res.json(ok(1));
});

// Segments CRUD
app.post('/api/wiki/segment', (req, res) => {
  const s = { id: uid('segment'), ...req.body, createTime: now() };
  db.wikiSegments.push(s);
  res.json(ok(s.id));
});
app.put('/api/wiki/segment/:id', (req, res) => {
  const idx = db.wikiSegments.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('片段不存在', 404));
  db.wikiSegments[idx] = { ...db.wikiSegments[idx], ...req.body };
  res.json(ok(1));
});
app.delete('/api/wiki/segment/:id', (req, res) => {
  db.wikiSegments = db.wikiSegments.filter(s => s.id !== Number(req.params.id));
  res.json(ok(1));
});

// Segments with embeddings — uses db.segmentEmbeddings
app.get('/api/wiki/entity/:entityId/segments-with-embeddings', (req, res) => {
  const entityId = Number(req.params.entityId);
  const embeddings = db.segmentEmbeddings.filter(e => e.entityId === entityId);
  if (embeddings.length > 0) {
    // Use pre-computed embeddings from db
    const segs = embeddings.map(e => {
      const seg = db.wikiSegments.find(s => s.id === e.segmentId || s.id === e.id);
      return {
        id: e.id,
        entityId: e.entityId,
        content: seg ? seg.content : e.content,
        source: seg ? seg.source : '',
        embedding: typeof e.embedding === 'string' ? e.embedding : JSON.stringify(e.embedding),
        dimensions: e.dimensions || 1536,
        modelVersion: e.modelVersion || 'text-embedding-v2',
      };
    });
    res.json(ok(segs));
  } else {
    // Fallback: generate on-the-fly for segments without pre-computed embeddings
    const segs = db.wikiSegments
      .filter(s => s.entityId === entityId)
      .map(s => ({
        id: s.id, entityId: s.entityId, content: s.content, source: s.source,
        embedding: JSON.stringify(Array.from({ length: 8 }, () => +(Math.random() * 2 - 1).toFixed(4))),
        dimensions: 1536, modelVersion: 'text-embedding-v2',
      }));
    res.json(ok(segs));
  }
});

// Rules CRUD (BUG-NEW-1: WikiRule INSERT 丢失 entityId)
app.post('/api/wiki/rule', (req, res) => {
  const r = { id: uid('rule'), ...req.body, status: 1, createTime: now() };
  if (bugs.wikiRuleEntityId) {
    // BUG-NEW-1: drop entityId from the stored rule
    delete r.entityId;
  }
  db.wikiRules.push(r);
  res.json(ok(r.id));
});
app.put('/api/wiki/rule/:id', (req, res) => {
  const idx = db.wikiRules.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('规则不存在', 404));
  db.wikiRules[idx] = { ...db.wikiRules[idx], ...req.body };
  res.json(ok(1));
});
app.delete('/api/wiki/rule/:id', (req, res) => {
  db.wikiRules = db.wikiRules.filter(r => r.id !== Number(req.params.id));
  res.json(ok(1));
});

// Relations CRUD
app.post('/api/wiki/relation', (req, res) => {
  const r = { id: uid('relation'), ...req.body };
  db.wikiRelations.push(r);
  res.json(ok(r.id));
});
app.put('/api/wiki/relation/:id', (req, res) => {
  const idx = db.wikiRelations.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json(err('关系不存在', 404));
  db.wikiRelations[idx] = { ...db.wikiRelations[idx], ...req.body };
  res.json(ok(1));
});
app.delete('/api/wiki/relation/:id', (req, res) => {
  db.wikiRelations = db.wikiRelations.filter(r => r.id !== Number(req.params.id));
  res.json(ok(1));
});

/* ================================================================
   Python Agent 模块
   ================================================================ */

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'cdc-agent' });
});

app.get('/api/agent/health', (req, res) => {
  res.json({ status: 'healthy', service: 'cdc-agent' });
});

// 意图解析 (BUG-NEW-2: parse-intent 参数绑定不匹配)
app.post('/api/agent/parse-intent', (req, res) => {
  if (bugs.parseIntParam) {
    // BUG simulation: expect query param but receive body -> 422
    if (!req.query.user_text) {
      return res.status(422).json({ detail: 'field required: user_text (query parameter)' });
    }
  }
  // Normal behavior: use body or query
  const userText = req.query.user_text || req.body?.user_text || '';
  res.json(mockParseIntentResponse);
});

// 向量检索
app.post('/api/agent/retrieve', (req, res) => {
  const segs = wikiSegments.slice(0, req.body?.top_k || 5).map(s => ({
    id: s.id, entity_id: s.entityId, content: s.content, source: s.source, score: 0.85 + Math.random() * 0.1,
  }));
  res.json({ top_k_segments: segs, used_segments: segs });
});

// 主生成端点（大纲或初稿）
app.post('/api/agent/generate', async (req, res) => {
  const { step } = req.body;
  console.log(`  Agent generate: step=${step}`);
  // 模拟 LLM 延迟
  await new Promise(r => setTimeout(r, step === 'outline' ? 2000 : 4000));
  if (step === 'outline') {
    res.json(mockAgentOutlineResponse);
  } else {
    res.json(mockAgentDraftResponse);
  }
});

// 图片生成（使用 mockImageGenResponse）
app.post('/api/agent/generate-images', async (req, res) => {
  await new Promise(r => setTimeout(r, 3000));
  res.json(mockImageGenResponse);
});

// Embedding 测试
app.post('/api/agent/embedding/test', (req, res) => {
  res.json({
    content: req.body?.content || '',
    embedding: Array.from({ length: 16 }, () => +(Math.random() * 2 - 1).toFixed(4)),
    dimensions: 1536,
    model: 'text-embedding-v2',
  });
});

/* ================================================================
   静态文件（模拟图片）
   ================================================================ */

app.get('/uploads/images/:filename', (req, res) => {
  // 返回一个 1x1 像素的占位图
  res.set('Content-Type', 'image/jpeg');
  res.send(Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64'
  ));
});

/* ── 测试面板（根路径）── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-dashboard.html'));
});

/* ── 启动 ── */
const PORT = 3001;
app.listen(PORT, () => {
  console.log('');
  console.log('+=====================================================+');
  console.log('|  CDC Mock Server v2 — 端口 ' + PORT + '                      |');
  console.log('|  共 70+ API 端点（Java + Agent + Test Control）      |');
  console.log('|  Bug 模拟：可通过 /api/test/bugs 查看和切换          |');
  console.log('+=====================================================+');
  console.log('');
  console.log('打开 test-dashboard.html 进行可视化测试');
  console.log('');
});
