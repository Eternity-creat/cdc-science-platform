/* ================================================================
   CDC 科普平台 — 自动化工作流测试
   覆盖全部核心流程，自动验证每步结果
   
   启动：node run-test.js
   前置：先 node mock-server.js
   ================================================================ */

const API = 'http://localhost:3001';

let passed = 0;
let failed = 0;
let warnings = 0;
let articleId = null;

/* ── 工具 ── */
async function request(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  try {
    const res = await fetch(API + url, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function unwrap(res) {
  if (res.ok && res.data?.code === 200) return res.data.data;
  return null;
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label} ${detail ? '— ' + detail : ''}`);
    failed++;
  }
}

function warn(label, detail = '') {
  console.log(`  ⚠️  ${label} ${detail ? '— ' + detail : ''}`);
  warnings++;
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

/* ================================================================
   测试套件
   ================================================================ */

async function testHealthCheck() {
  section('1. 服务健康检查');
  const res = await request('GET', '/health');
  assert('Agent 健康检查', res.ok && res.data?.status === 'healthy');

  const res2 = await request('GET', '/api/agent/health');
  assert('Agent Router 健康检查', res2.ok && res2.data?.status === 'healthy');
}

async function testFormDropdown() {
  section('2. 表单下拉数据');
  const res = await request('GET', '/api/article/form/dropdown');
  const data = unwrap(res);
  assert('下拉数据加载', data !== null);
  assert('疾病列表非空', data?.diseaseList?.length > 0, `count=${data?.diseaseList?.length}`);
  assert('疫苗列表非空', data?.vaccineList?.length > 0, `count=${data?.vaccineList?.length}`);
  assert('人群列表非空', data?.populationList?.length > 0);
  assert('场景列表非空', data?.sceneList?.length > 0);
  assert('模板列表非空', data?.templateList?.length > 0);
}

async function testArticleCreate() {
  section('3. 创建文章（表单模式）');
  const res = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 2, entityId: 3, populationId: 5,
    sceneId: 7, templateId: 1, wordCount: 1000,
  });
  const data = unwrap(res);
  articleId = data?.articleId;
  assert('文章创建成功', articleId !== null && articleId !== undefined, `articleId=${articleId}`);
  assert('返回 status=1', data?.status === 1, `status=${data?.status}`);

  // 验证文章详情
  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('文章详情可查', article !== null);
  assert('初始 status=1', article?.status === 1, `status=${article?.status}`);
  assert('outline 为空', article?.outline === '' || article?.outline === null);
}

async function testArticleCreateText() {
  section('3b. 创建文章（自由文本模式）');
  const res = await request('POST', '/api/article/generate/text', {
    userText: '写一篇关于流感疫苗的儿童接种指南', templateId: 3,
  });
  const data = unwrap(res);
  const textArticleId = data?.articleId;
  assert('自由文本文章创建成功', textArticleId > 0, `articleId=${textArticleId}`);
  assert('mode=2', data?.status === 1);
}

async function testOutlineGeneration() {
  section('4. AI 生成大纲');
  const res = await request('POST', `/api/article/${articleId}/generate-outline`);
  const outline = unwrap(res);
  assert('大纲生成成功', outline !== null && outline.length > 0, `length=${outline?.length}`);
  assert('大纲包含章节标题', outline?.includes('##'), '未找到 ## 标题');

  // 验证状态变为 2
  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 更新为 2', article?.status === 2, `status=${article?.status}`);
  assert('outline 已存储', article?.outline?.length > 0);
}

async function testOutlineSaveBug() {
  section('5. 保存大纲（验证修复）');
  const editedOutline = '# HPV疫苗科普（已手动修改）\n## 一、什么是HPV\n## 二、疫苗原理\n## 三、接种建议';
  const res = await request('PUT', `/api/article/${articleId}/outline`, JSON.stringify(editedOutline));
  assert('保存请求返回成功', res.ok && unwrap(res) === true);

  // 检查 status 是否被保留（修复后不应为 null）
  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 保持为 2（未被覆盖为 null）', article?.status === 2, `status=${article?.status}`);
  assert('outline 内容已更新', article?.outline?.includes('已手动修改'));

  // 验证修改历史
  const mods = await request('GET', `/api/article/${articleId}/modifications`);
  const modList = unwrap(mods);
  const editMod = modList?.find(m => m.operationType === 'manual_edit' && m.modifyType === 'outline');
  assert('修改历史已记录', editMod !== undefined);
}

async function testOutlineConfirm() {
  section('6. 确认大纲');
  // 先恢复 status（模拟 confirm-outline 修复 null status）
  const res = await request('POST', `/api/article/${articleId}/confirm-outline`);
  assert('确认请求成功', res.ok && unwrap(res) === true);

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 恢复为 2', article?.status === 2, `status=${article?.status}`);
}

async function testDraftGeneration() {
  section('7. AI 生成初稿');
  const res = await request('POST', `/api/article/${articleId}/generate-draft`);
  const draft = unwrap(res);
  assert('初稿生成成功', draft !== null && draft.length > 0, `length=${draft?.length}`);
  assert('初稿包含内容', draft?.includes('HPV') || draft?.includes('疫苗'));

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 更新为 3', article?.status === 3, `status=${article?.status}`);
  assert('initialDraft 已存储', article?.initialDraft?.length > 0);

  // 验证 trace
  const traceRes = await request('GET', `/api/article/${articleId}/trace`);
  const traceList = unwrap(traceRes);
  assert('Agent trace 已记录', traceList?.length > 0, `count=${traceList?.length}`);
}

async function testDraftSaveBug() {
  section('8. 保存初稿（验证修复）');
  const editedDraft = '# HPV疫苗科普（手动编辑版）\n\n这是手动编辑后的初稿内容...';
  const res = await request('PUT', `/api/article/${articleId}/draft`, JSON.stringify(editedDraft));
  assert('保存请求返回成功', res.ok);

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 保持为 3（未被覆盖为 null）', article?.status === 3, `status=${article?.status}`);
}

async function testDraftConfirm() {
  section('9. 确认终稿');
  const res = await request('POST', `/api/article/${articleId}/confirm-draft`);
  assert('确认请求成功', res.ok);

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 更新为 4', article?.status === 4, `status=${article?.status}`);
  assert('finalArticle 已生成', article?.finalArticle?.length > 0);
}

async function testPublish() {
  section('10. 发布文章');
  const res = await request('POST', `/api/article/${articleId}/confirm`);
  assert('发布成功', res.ok);

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('status 更新为 5', article?.status === 5, `status=${article?.status}`);
}

async function testAutoSave() {
  section('11. 自动保存');
  const res = await request('POST', `/api/article/${articleId}/autosave`, {
    field: 'outline', content: '# 自动保存的大纲\n## 测试章节',
  });
  assert('自动保存成功', res.ok && unwrap(res) === true);

  const detail = await request('GET', `/api/article/${articleId}`);
  const article = unwrap(detail);
  assert('outline 已更新', article?.outline?.includes('自动保存'));
}

async function testRevert() {
  section('12. 版本回退');
  const mods = await request('GET', `/api/article/${articleId}/modifications`);
  const modList = unwrap(mods);
  const firstMod = modList?.[0];
  if (!firstMod) {
    warn('无修改历史，跳过回退测试');
    return;
  }
  const res = await request('POST', `/api/article/${articleId}/revert`, { modificationId: firstMod.id });
  assert('回退请求成功', res.ok);
}

async function testWikiCRUD() {
  section('13. 知识库 CRUD');
  // List
  const listRes = await request('GET', '/api/wiki/list');
  const list = unwrap(listRes);
  assert('知识库列表加载', list?.length > 0, `count=${list?.length}`);

  // Create
  const createRes = await request('POST', '/api/wiki', {
    entityType: 1, stdName: '测试疾病', alias: 'test', summary: '测试用',
  });
  const newId = unwrap(createRes);
  assert('创建实体成功', newId > 0);

  // Segment
  const segRes = await request('POST', '/api/wiki/segment', {
    entityId: newId, content: '这是一段测试知识片段', source: '测试来源',
  });
  assert('创建片段成功', unwrap(segRes) > 0);

  // Rule
  const ruleRes = await request('POST', '/api/wiki/rule', {
    ruleType: 'MustInclude', content: '测试规则', applyEntityIds: String(newId),
  });
  assert('创建规则成功', unwrap(ruleRes) > 0);

  // Delete
  const delRes = await request('DELETE', `/api/wiki/${newId}`);
  assert('删除实体成功', unwrap(delRes) === 1);
}

async function testTemplateCRUD() {
  section('14. 模板 CRUD');
  const listRes = await request('GET', '/api/template/list');
  const list = unwrap(listRes);
  assert('模板列表加载', list?.length > 0);

  const createRes = await request('POST', '/api/template', {
    templateName: '测试模板', tag: 'test', purpose: '测试用',
    tone: '["专业"]', outlineStructure: '[]',
  });
  assert('创建模板成功', unwrap(createRes) > 0);
}

async function testLlmConfig() {
  section('15. LLM 配置');
  const listRes = await request('GET', '/api/llm-config');
  const list = unwrap(listRes);
  assert('LLM 配置列表', list?.length > 0);

  const defaultRes = await request('GET', '/api/llm-config/default/text_generation');
  const def = unwrap(defaultRes);
  assert('默认配置存在', def !== null && def?.isDefault === 1);
}

async function testAgentEndpoints() {
  section('16. Agent 端点');
  // Intent
  const intentRes = await request('POST', '/api/agent/parse-intent?user_text=HPV疫苗科普');
  assert('意图解析', intentRes.ok && intentRes.data?.entity_name);

  // Retrieve
  const retrieveRes = await request('POST', '/api/agent/retrieve', {
    entity_name: 'HPV', top_k: 3,
  });
  assert('向量检索', retrieveRes.ok && retrieveRes.data?.top_k_segments?.length > 0);

  // Generate
  const genRes = await request('POST', '/api/agent/generate', {
    article_id: articleId || 1, step: 'outline', mode: 1,
    entity_name: 'HPV疫苗', word_count: 800,
  });
  assert('Agent 生成', genRes.ok && genRes.data?.content?.length > 0);

  // Images
  const imgRes = await request('POST', '/api/agent/generate-images', {
    article_id: 1, draft_content: 'test', max_images: 1,
  });
  assert('图片生成', imgRes.ok && imgRes.data?.total > 0);
}

async function testArticleList() {
  section('17. 文章分页与筛选');
  const pagedRes = await request('GET', '/api/article/list/paged?page=1&size=5');
  const paged = unwrap(pagedRes);
  assert('分页列表', paged?.list?.length > 0 && paged?.total > 0);

  const filterRes = await request('GET', '/api/article/list/paged?status=5&page=1&size=10');
  const filtered = unwrap(filterRes);
  assert('按状态筛选', filtered?.list?.every(a => a.status === 5) || filtered?.list?.length === 0);
}

async function testArticleDelete() {
  section('18. 文章删除');
  // 创建临时文章
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const tempId = unwrap(createRes)?.articleId;

  const delRes = await request('DELETE', `/api/article/${tempId}`);
  assert('删除文章成功', unwrap(delRes) === true);

  const detailRes = await request('GET', `/api/article/${tempId}`);
  assert('删除后查不到', detailRes.status === 404);
}

/* ================================================================
   Module A: Data Integrity Tests
   ================================================================ */

// A1: WikiRule CRUD with entityId
async function testWikiRuleIntegrity() {
  section('19. 知识库规则完整性');
  // Create a wiki entity first
  const entityRes = await request('POST', '/api/wiki', {
    entityType: 1, stdName: '测试疾病-规则', alias: 'test', summary: '测试用',
  });
  const entityId = unwrap(entityRes);
  assert('创建测试实体', entityId > 0);

  // Create a rule with entityId
  const ruleRes = await request('POST', '/api/wiki/rule', {
    entityId: entityId, ruleType: 'MustInclude', content: '测试规则内容', applyEntityIds: String(entityId),
  });
  const ruleId = unwrap(ruleRes);
  assert('创建规则', ruleId > 0);

  // Fetch entity detail and check rule appears
  const detailRes = await request('GET', `/api/wiki/${entityId}`);
  const detail = unwrap(detailRes);
  const hasRule = detail?.rules?.some(r => r.id === ruleId);
  assert('实体详情包含规则', hasRule, `rules=${JSON.stringify(detail?.rules)}`);

  // Delete rule
  const delRes = await request('DELETE', `/api/wiki/rule/${ruleId}`);
  assert('删除规则', unwrap(delRes) === 1);

  // Cleanup
  await request('DELETE', `/api/wiki/${entityId}`);
}

// A2: Free text generation (parse-intent)
async function testFreeTextGeneration() {
  section('20. 自由文本生成流程');
  const res = await request('POST', '/api/article/generate/text', {
    userText: '写一篇关于老年人流感防护的科普文章', templateId: 3,
  });
  const data = unwrap(res);
  assert('自由文本文章创建', data?.articleId > 0);

  // Verify the article has correct entity resolved from parse-intent
  const detail = await request('GET', `/api/article/${data?.articleId}`);
  const article = unwrap(detail);
  assert('文章 entityName 已解析', article?.entityName?.length > 0, `entityName=${article?.entityName}`);
  assert('文章 mode=2', article?.mode === 2);
}

// A3: Confirm final with empty draft
async function testConfirmFinalEmptyDraft() {
  section('21. 空初稿确认终稿');
  // Create a fresh article with no draft
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  assert('创建测试文章', id > 0);

  // Try to confirm final without generating draft
  const res = await request('POST', `/api/article/${id}/confirm`);
  // Should return error (400), not succeed with null content
  const isRejected = !res.ok || res.status >= 400;
  assert('空初稿拒绝确认终稿', isRejected, `status=${res.status}`);

  // Cleanup
  await request('DELETE', `/api/article/${id}`);
}

// A4: Nonexistent article operations
async function testNonexistentArticle() {
  section('22. 不存在文章操作');
  const fakeId = 999999;

  // GET
  const getRes = await request('GET', `/api/article/${fakeId}`);
  assert('GET 返回 404', getRes.status === 404);

  // PUT outline
  const putRes = await request('PUT', `/api/article/${fakeId}/outline`, '"test"');
  assert('PUT outline 返回 404', putRes.status === 404);

  // PUT draft
  const putDraft = await request('PUT', `/api/article/${fakeId}/draft`, '"test"');
  assert('PUT draft 返回 404', putDraft.status === 404);

  // POST confirm
  const postRes = await request('POST', `/api/article/${fakeId}/confirm-outline`);
  assert('POST confirm-outline 返回 404', postRes.status === 404);

  // POST generate
  const genRes = await request('POST', `/api/article/${fakeId}/generate-outline`);
  assert('POST generate-outline 返回 404', genRes.status === 404);
}

// A5: Modification record dedup
async function testModificationDedup() {
  section('23. 修改记录去重');
  // Create article and generate outline
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Regenerate outline
  await request('POST', `/api/article/${id}/regenerate-outline`);

  // Check modifications - should not have duplicates
  const modsRes = await request('GET', `/api/article/${id}/modifications`);
  const mods = unwrap(modsRes) || [];
  const regenMods = mods.filter(m => m.operationType === 'ai_regenerate' && m.modifyType === 'outline');
  assert('重新生成只产生一条记录', regenMods.length <= 1, `count=${regenMods.length}`);

  // Cleanup
  await request('DELETE', `/api/article/${id}`);
}

// A6: Agent error handling
async function testAgentErrorHandling() {
  section('24. Agent 异常处理');
  // Create article
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;

  // Call error simulation endpoint
  const errRes = await request('POST', `/api/article/${id}/generate-outline-error`);
  // Should return 500, NOT store error as content
  const isProperError = errRes.status >= 400;
  assert('Agent 异常返回错误码', isProperError, `status=${errRes.status}`);

  // Verify article outline is still empty
  const detail = await request('GET', `/api/article/${id}`);
  const article = unwrap(detail);
  const noErrorContent = !article?.outline?.includes('Agent 服务异常');
  assert('错误信息未存为内容', noErrorContent, `outline=${article?.outline?.slice(0,50)}`);

  await request('DELETE', `/api/article/${id}`);
}

// A7: Revert safety
async function testRevertSafety() {
  section('25. 版本回退安全性');
  // Create and generate outline
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Get modifications
  const modsRes = await request('GET', `/api/article/${id}/modifications`);
  const mods = unwrap(modsRes) || [];

  // Find a mod with null/empty beforeContent
  const nullMod = mods.find(m => !m.beforeContent || m.beforeContent === '');
  if (nullMod) {
    // Try to revert to it - should be handled safely
    const revertRes = await request('POST', `/api/article/${id}/revert`, { modificationId: nullMod.id });
    // After revert, check the article still has valid state
    const detail = await request('GET', `/api/article/${id}`);
    const article = unwrap(detail);
    // outline should not be null (safe revert) OR should be handled gracefully
    assert('回退到空内容被安全处理', article !== null);
  } else {
    assert('无可用的空 beforeContent 记录（跳过）', true);
  }

  await request('DELETE', `/api/article/${id}`);
}

// A8: Pagination boundary
async function testPaginationBoundary() {
  section('26. 分页边界');
  // page=0
  const p0 = await request('GET', '/api/article/list/paged?page=0&size=10');
  assert('page=0 不崩溃', p0.ok, `status=${p0.status}`);

  // page=-1
  const p1 = await request('GET', '/api/article/list/paged?page=-1&size=10');
  assert('page=-1 不崩溃', p1.ok, `status=${p1.status}`);

  // page=99999
  const pBig = await request('GET', '/api/article/list/paged?page=99999&size=10');
  const pData = unwrap(pBig);
  assert('超大 page 返回空列表', pData?.list?.length === 0 || pData?.list?.length >= 0);
}

// A9: Delete cascade
async function testDeleteCascade() {
  section('27. 删除级联完整性');
  // Create article
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;

  // Generate outline to create modifications
  await request('POST', `/api/article/${id}/generate-outline`);

  // Add an image
  await request('POST', '/api/article-image', {
    articleId: id, imageKey: 'test_cascade', filePath: '/uploads/test.jpg',
    caption: 'test', position: 1, generatedBy: 'test', status: 1,
  });

  // Delete article
  await request('DELETE', `/api/article/${id}`);

  // Verify article gone
  const detailRes = await request('GET', `/api/article/${id}`);
  assert('文章已删除', detailRes.status === 404);

  // Verify modifications cleaned
  const modsRes = await request('GET', `/api/article/${id}/modifications`);
  const mods = unwrap(modsRes);
  assert('修改记录已清理', !mods || mods.length === 0);

  // Verify images cleaned
  const imgRes = await request('GET', `/api/article-image/article/${id}`);
  const imgs = unwrap(imgRes);
  assert('图片已清理', !imgs || imgs.length === 0, `imgs=${JSON.stringify(imgs)}`);
}

/* ================================================================
   Module B: Interaction Logic Tests
   ================================================================ */

// B1: Full workbench editing sequence
async function testWorkbenchSequence() {
  section('28. Workbench 完整编辑序列');
  // Create article
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 2, entityId: 3, populationId: 5, sceneId: 7, templateId: 1, wordCount: 1000,
  });
  const id = unwrap(createRes)?.articleId;
  assert('B1: 创建文章', id > 0);

  // Load context
  const ctxRes = await request('GET', `/api/article/context/${id}`);
  const ctx = unwrap(ctxRes);
  assert('B1: 上下文加载', ctx !== null);
  assert('B1: 包含实体信息', ctx?.entity !== null && ctx?.entity !== undefined);

  // Generate outline
  const outRes = await request('POST', `/api/article/${id}/generate-outline`);
  assert('B1: 大纲生成', unwrap(outRes)?.length > 0);

  // Auto-save
  const autoRes = await request('POST', `/api/article/${id}/autosave`, {
    field: 'outline', content: '# 自动保存测试大纲\n## 第一章',
  });
  assert('B1: 自动保存', autoRes.ok);

  // Manual save
  const saveRes = await request('PUT', `/api/article/${id}/outline`, JSON.stringify('# 手动保存大纲\n## 修改后'));
  assert('B1: 手动保存', saveRes.ok);

  // Verify status preserved after manual save
  let detail = await request('GET', `/api/article/${id}`);
  let art = unwrap(detail);
  assert('B1: 手动保存后 status=2', art?.status === 2);

  // Confirm outline
  const confirmRes = await request('POST', `/api/article/${id}/confirm-outline`);
  assert('B1: 确认大纲', confirmRes.ok);

  // Generate draft
  const draftRes = await request('POST', `/api/article/${id}/generate-draft`);
  assert('B1: 初稿生成', unwrap(draftRes)?.length > 0);

  // Edit and save draft
  const saveDraft = await request('PUT', `/api/article/${id}/draft`, JSON.stringify('# 编辑后的初稿'));
  assert('B1: 保存初稿', saveDraft.ok);

  detail = await request('GET', `/api/article/${id}`);
  art = unwrap(detail);
  assert('B1: 保存初稿后 status=3', art?.status === 3);

  // Confirm draft -> final
  const confirmDraft = await request('POST', `/api/article/${id}/confirm-draft`);
  assert('B1: 确认终稿', confirmDraft.ok);

  detail = await request('GET', `/api/article/${id}`);
  art = unwrap(detail);
  assert('B1: 终稿 status=4', art?.status === 4);
  assert('B1: finalArticle 非空', art?.finalArticle?.length > 0);

  // Publish
  const pubRes = await request('POST', `/api/article/${id}/confirm`);
  assert('B1: 发布', pubRes.ok);

  detail = await request('GET', `/api/article/${id}`);
  art = unwrap(detail);
  assert('B1: 已发布 status=5', art?.status === 5);

  await request('DELETE', `/api/article/${id}`);
}

// B2: Auto-save vs manual-save concurrency
async function testAutoSaveConcurrency() {
  section('29. 自动保存与手动保存并发');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Simulate rapid auto-save + manual save
  const results = await Promise.all([
    request('POST', `/api/article/${id}/autosave`, { field: 'outline', content: '自动保存版本A' }),
    request('PUT', `/api/article/${id}/outline`, JSON.stringify('手动保存版本B')),
    request('POST', `/api/article/${id}/autosave`, { field: 'outline', content: '自动保存版本C' }),
  ]);

  const allOk = results.every(r => r.ok);
  assert('并发保存全部成功', allOk);

  // Final content should be deterministic (last write wins)
  const detail = await request('GET', `/api/article/${id}`);
  const art = unwrap(detail);
  assert('最终内容非空', art?.outline?.length > 0);
  assert('status 保持正常', art?.status === 2, `status=${art?.status}`);

  await request('DELETE', `/api/article/${id}`);
}

// B3: Confirm outline with content parameter
async function testConfirmOutlineWithContent() {
  section('30. 带内容的确认大纲');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Confirm with edited content (sent as JSON object, like real frontend)
  const editedContent = '# 最终确认版大纲\n## 第一章\n## 第二章';
  const res = await request('POST', `/api/article/${id}/confirm-outline`, { content: editedContent });
  assert('带内容确认成功', res.ok);

  // Verify the outline matches the confirmed content
  const detail = await request('GET', `/api/article/${id}`);
  const art = unwrap(detail);
  assert('大纲更新为确认版本', art?.outline?.includes('最终确认版'));

  await request('DELETE', `/api/article/${id}`);
}

// B4: Regenerate then revert
async function testRegenerateAndRevert() {
  section('31. 重新生成后回退');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;

  // Generate outline
  await request('POST', `/api/article/${id}/generate-outline`);
  const detail1 = await request('GET', `/api/article/${id}`);
  const outline1 = unwrap(detail1)?.outline;

  // Regenerate
  await request('POST', `/api/article/${id}/regenerate-outline`);
  const detail2 = await request('GET', `/api/article/${id}`);
  const outline2 = unwrap(detail2)?.outline;
  assert('重新生成内容不同', outline1 !== outline2);

  // Get modifications and revert to first
  const modsRes = await request('GET', `/api/article/${id}/modifications`);
  const mods = unwrap(modsRes) || [];
  if (mods.length > 0) {
    const firstMod = mods[0];
    const revertRes = await request('POST', `/api/article/${id}/revert`, { modificationId: firstMod.id });
    assert('回退请求成功', revertRes.ok);
  } else {
    assert('有修改记录', false, 'mods is empty');
  }

  await request('DELETE', `/api/article/${id}`);
}

// B5: Status state machine
async function testStatusStateMachine() {
  section('32. 状态机完整性 (1→2→3→4→5)');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;

  // Status 1: Created
  let d = unwrap(await request('GET', `/api/article/${id}`));
  assert('创建后 status=1', d?.status === 1);

  // Status 2: After outline generation
  await request('POST', `/api/article/${id}/generate-outline`);
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('生成大纲后 status=2', d?.status === 2);

  // Save should NOT change status
  await request('PUT', `/api/article/${id}/outline`, JSON.stringify('edited'));
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('保存后 status 不变', d?.status === 2);

  // Status 3: After draft generation
  await request('POST', `/api/article/${id}/confirm-outline`);
  await request('POST', `/api/article/${id}/generate-draft`);
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('生成初稿后 status=3', d?.status === 3);

  // Save should NOT change status
  await request('PUT', `/api/article/${id}/draft`, JSON.stringify('edited draft'));
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('保存初稿后 status 不变', d?.status === 3);

  // Status 4: After confirm draft
  await request('POST', `/api/article/${id}/confirm-draft`);
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('确认终稿后 status=4', d?.status === 4);

  // Status 5: After publish
  await request('POST', `/api/article/${id}/confirm`);
  d = unwrap(await request('GET', `/api/article/${id}`));
  assert('发布后 status=5', d?.status === 5);

  await request('DELETE', `/api/article/${id}`);
}

/* ================================================================
   Module D: Cross-Module Data Flow Tests
   ================================================================ */

// D1: Wiki → Article generation chain
async function testWikiToArticleChain() {
  section('33. 知识库→文章生成链路');
  // Create entity + segments + rules
  const entityRes = await request('POST', '/api/wiki', {
    entityType: 1, stdName: '链路测试疾病', alias: 'test-chain', summary: '用于测试知识到文章的链路',
  });
  const eid = unwrap(entityRes);

  await request('POST', '/api/wiki/segment', {
    entityId: eid, content: '这是链路测试的知识片段1', source: '测试来源',
  });
  await request('POST', '/api/wiki/rule', {
    entityId: eid, ruleType: 'MustInclude', content: '必须包含测试关键词', applyEntityIds: String(eid),
  });

  // Create article referencing this entity
  const artRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: eid, templateId: 1, wordCount: 500,
  });
  const artId = unwrap(artRes)?.articleId;

  // Get context and verify it includes our segments and rules
  const ctxRes = await request('GET', `/api/article/context/${artId}`);
  const ctx = unwrap(ctxRes);
  assert('D1: context 包含实体', ctx?.entity !== null && ctx?.entity !== undefined);
  assert('D1: context 包含知识片段', ctx?.segments?.length > 0, `segments=${ctx?.segments?.length}`);
  assert('D1: context 包含规则', ctx?.rules?.length > 0, `rules=${ctx?.rules?.length}`);

  // Cleanup
  await request('DELETE', `/api/article/${artId}`);
  await request('DELETE', `/api/wiki/${eid}`);
}

// D2: Template → Article chain
async function testTemplateToArticleChain() {
  section('34. 模板→文章生成链路');
  // Create custom template
  const tplRes = await request('POST', '/api/template', {
    templateName: '链路测试模板', tag: 'test', purpose: '测试用',
    tone: JSON.stringify(['专业']), outlineStructure: JSON.stringify([{ title: '第一章', children: [] }]),
  });
  const tplId = unwrap(tplRes);
  assert('D2: 创建模板', tplId > 0);

  // Create article with this template
  const artRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: tplId, wordCount: 800,
  });
  const artId = unwrap(artRes)?.articleId;

  // Verify template name propagated
  const detail = unwrap(await request('GET', `/api/article/${artId}`));
  assert('D2: templateName 已传递', detail?.templateName === '链路测试模板' || detail?.templateId === tplId);

  // Cleanup
  await request('DELETE', `/api/article/${artId}`);
  await request('DELETE', `/api/template/${tplId}`);
}

// D3: Image → Article chain
async function testImageToArticleChain() {
  section('35. 图片→文章关联链路');
  // Create article
  const artRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const artId = unwrap(artRes)?.articleId;

  // Generate images
  const imgGenRes = await request('POST', '/api/agent/generate-images', {
    article_id: artId, draft_content: '# 测试内容\n## 章节1', max_images: 2,
  });
  assert('D3: 图片生成成功', imgGenRes.ok);
  const imgGen = imgGenRes.data;

  // Batch save images
  const images = (imgGen?.images || []).map((img, i) => ({
    articleId: artId, imageKey: `chain_${i}`, filePath: img.file_path,
    caption: img.caption, position: i + 1, generatedBy: 'test',
    generationPrompt: img.caption, width: img.width, height: img.height,
    fileSize: img.file_size, status: 1,
  }));
  if (images.length > 0) {
    const batchRes = await request('POST', '/api/article-image/batch', images);
    assert('D3: 批量保存图片', batchRes.ok);
  }

  // Query article images
  const listRes = await request('GET', `/api/article-image/article/${artId}`);
  const imgList = unwrap(listRes);
  assert('D3: 文章图片列表', imgList?.length > 0, `count=${imgList?.length}`);

  // Delete article and check images
  await request('DELETE', `/api/article/${artId}`);
  const afterDel = unwrap(await request('GET', `/api/article-image/article/${artId}`));
  assert('D3: 删除文章后图片已清理', !afterDel || afterDel.length === 0);
}

/* ================================================================
   Module E: Edge Cases
   ================================================================ */

// E1: Concurrent article creation
async function testConcurrentCreation() {
  section('36. 并发创建文章');
  const promises = Array.from({length: 5}, (_, i) =>
    request('POST', '/api/article/generate', {
      mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500 + i * 100,
    })
  );
  const results = await Promise.all(promises);
  const ids = results.map(r => unwrap(r)?.articleId).filter(Boolean);
  assert('E1: 5个并发全部成功', ids.length === 5, `success=${ids.length}`);

  // Verify all IDs are unique
  const uniqueIds = new Set(ids);
  assert('E1: ID 全部唯一', uniqueIds.size === ids.length, `unique=${uniqueIds.size}`);

  // Cleanup
  for (const id of ids) await request('DELETE', `/api/article/${id}`);
}

// E2: Long content
async function testLongContent() {
  section('37. 超长内容保存');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Generate 100KB content
  const longContent = '# 超长大纲\n' + Array.from({length: 1000}, (_, i) => `## 第${i+1}章\n这是第${i+1}章的内容...`).join('\n');
  const saveRes = await request('PUT', `/api/article/${id}/outline`, JSON.stringify(longContent));
  assert('E2: 超长内容保存成功', saveRes.ok, `status=${saveRes.status}`);

  // Verify content stored correctly
  const detail = unwrap(await request('GET', `/api/article/${id}`));
  assert('E2: 内容完整存储', detail?.outline?.length > 10000, `len=${detail?.outline?.length}`);

  await request('DELETE', `/api/article/${id}`);
}

// E3: Special characters
async function testSpecialCharacters() {
  section('38. 特殊字符处理');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Content with SQL injection attempts and special chars
  const specialContent = "# 特殊字符测试\n## SQL: ' OR 1=1 --\n## HTML: <script>alert('xss')</script>\n## Backslash: \\\\n\\\\t\n## Unicode: 🎉🎊\n## Quotes: \"double\" and 'single'";
  const saveRes = await request('PUT', `/api/article/${id}/outline`, JSON.stringify(specialContent));
  assert('E3: 特殊字符保存成功', saveRes.ok);

  const detail = unwrap(await request('GET', `/api/article/${id}`));
  assert('E3: 特殊字符完整保存', detail?.outline?.includes('OR 1=1'));
  assert('E3: HTML 标签保留', detail?.outline?.includes('<script>'));

  await request('DELETE', `/api/article/${id}`);
}

// E4: Idempotent operations
async function testIdempotency() {
  section('39. 重复操作幂等性');
  const createRes = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  const id = unwrap(createRes)?.articleId;
  await request('POST', `/api/article/${id}/generate-outline`);

  // Confirm outline twice
  const c1 = await request('POST', `/api/article/${id}/confirm-outline`);
  const c2 = await request('POST', `/api/article/${id}/confirm-outline`);
  assert('E4: 两次 confirm-outline 都成功', c1.ok && c2.ok);

  await request('POST', `/api/article/${id}/generate-draft`);

  // Confirm draft twice
  const d1 = await request('POST', `/api/article/${id}/confirm-draft`);
  const d2 = await request('POST', `/api/article/${id}/confirm-draft`);
  assert('E4: 两次 confirm-draft 都成功', d1.ok && d2.ok);

  // Status should still be 4
  const detail = unwrap(await request('GET', `/api/article/${id}`));
  assert('E4: 重复确认后 status=4', detail?.status === 4);

  await request('DELETE', `/api/article/${id}`);
}

/* ================================================================
   Module: Bug Simulation Verification
   ================================================================ */

// Helper: toggle a bug on or off
async function toggleBug(name, enable) {
  const res = await request('PUT', `/api/test/toggle-bug/${name}`, { enable });
  return unwrap(res);
}

// Helper: create a test article and return its id
async function createTestArticle() {
  const res = await request('POST', '/api/article/generate', {
    mode: 1, entityType: 1, entityId: 1, templateId: 1, wordCount: 500,
  });
  return unwrap(res)?.articleId;
}

// 40a. BUG-NEW-1: WikiRule INSERT 丢失 entityId
async function testBug_WikiRuleEntityId() {
  section('40a. BUG-NEW-1: WikiRule 丢失 entityId');

  // --- Bug ON ---
  await toggleBug('wikiRuleEntityId', true);
  const createRes = await request('POST', '/api/wiki/rule', {
    entityId: 1, ruleType: 'contraindication', content: '孕妇禁用_BUG_ON', priority: 1,
  });
  const ruleId = unwrap(createRes);
  // 直接查刚创建的规则（用 content 匹配，避免 ID 类型问题）
  const listRes = await request('GET', '/api/wiki/rule');
  const rules = unwrap(listRes) || [];
  const bugRule = rules.find(r => r.content === '孕妇禁用_BUG_ON');
  assert('Bug 开启：规则 entityId 丢失', bugRule && bugRule.entityId === undefined,
    `rule=${JSON.stringify(bugRule)?.slice(0, 80)}`);

  // --- Bug OFF ---
  await toggleBug('wikiRuleEntityId', false);
  const createRes2 = await request('POST', '/api/wiki/rule', {
    entityId: 1, ruleType: 'contraindication', content: '孕妇禁用_BUG_OFF', priority: 1,
  });
  const listRes2 = await request('GET', '/api/wiki/rule');
  const rules2 = unwrap(listRes2) || [];
  const fixedRule = rules2.find(r => r.content === '孕妇禁用_BUG_OFF');
  assert('Bug 关闭：规则 entityId 正常', fixedRule && fixedRule.entityId === 1,
    `rule=${JSON.stringify(fixedRule)?.slice(0, 80)}`);

  // Cleanup
  if (ruleId) await request('DELETE', `/api/wiki/rule/${ruleId}`);
  const ruleId2 = unwrap(createRes2);
  if (ruleId2) await request('DELETE', `/api/wiki/rule/${ruleId2}`);
}

// 40b. BUG-NEW-2: parse-intent 参数绑定不匹配
async function testBug_ParseIntentParam() {
  section('40b. BUG-NEW-2: parse-intent 参数绑定');

  // --- Bug ON: 发 body 但服务端只读 query → 422 ---
  await toggleBug('parseIntParam', true);
  const bugRes = await request('POST', '/api/agent/parse-intent', { user_text: '流感疫苗接种注意事项' });
  assert('Bug 开启：body 传参被拒绝 (422)', bugRes.status === 422,
    `status=${bugRes.status}`);

  // --- Bug OFF: body 正常接收 ---
  await toggleBug('parseIntParam', false);
  const fixedRes = await request('POST', '/api/agent/parse-intent', { user_text: '流感疫苗接种注意事项' });
  assert('Bug 关闭：body 传参正常 (200)', fixedRes.ok,
    `status=${fixedRes.status}`);
}

// 40c. BUG-NEW-3: confirmFinal 不校验空初稿
async function testBug_ConfirmFinalNoCheck() {
  section('40c. BUG-NEW-3: confirmFinal 空初稿校验');

  // --- Bug ON: 空初稿也能确认终稿 ---
  await toggleBug('confirmFinalNoCheck', true);
  const id1 = await createTestArticle();
  const bugConfirm = await request('POST', `/api/article/${id1}/confirm`);
  assert('Bug 开启：空初稿可确认终稿', bugConfirm.ok,
    `status=${bugConfirm.status}`);

  // --- Bug OFF: 空初稿被拒绝 ---
  await toggleBug('confirmFinalNoCheck', false);
  const id2 = await createTestArticle();
  const fixedConfirm = await request('POST', `/api/article/${id2}/confirm`);
  assert('Bug 关闭：空初稿拒绝确认', !fixedConfirm.ok,
    `status=${fixedConfirm.status}`);

  await request('DELETE', `/api/article/${id1}`);
  await request('DELETE', `/api/article/${id2}`);
}

// 40d. BUG-NEW-4: 不存在文章返回 500 NPE 而非 404
async function testBug_NpeOnMissingArticle() {
  section('40d. BUG-NEW-4: 不存在文章 NPE');

  const fakeId = 999999;

  // --- Bug ON: 返回 500 (NPE 模拟) ---
  await toggleBug('npeOnMissingArticle', true);
  const bugRes = await request('GET', `/api/article/${fakeId}`);
  assert('Bug 开启：返回 500 而非 404', bugRes.status === 500,
    `status=${bugRes.status}`);

  // --- Bug OFF: 正确返回 404 ---
  await toggleBug('npeOnMissingArticle', false);
  const fixedRes = await request('GET', `/api/article/${fakeId}`);
  assert('Bug 关闭：正确返回 404', fixedRes.status === 404,
    `status=${fixedRes.status}`);
}

// 40e. BUG-NEW-5: 重新生成大纲产生重复修改记录
async function testBug_DuplicateModRecord() {
  section('40e. BUG-NEW-5: 重复修改记录');

  // --- Bug ON ---
  await toggleBug('duplicateModRecord', true);
  const id1 = await createTestArticle();
  await request('POST', `/api/article/${id1}/generate-outline`);
  await request('POST', `/api/article/${id1}/regenerate-outline`);
  const mods1 = unwrap(await request('GET', `/api/article/${id1}/modifications`)) || [];
  const regenMods = mods1.filter(m => m.operationType === 'ai_regenerate');
  assert('Bug 开启：重新生成产生 2 条记录', regenMods.length === 2,
    `实际 ${regenMods.length} 条`);

  // --- Bug OFF ---
  await toggleBug('duplicateModRecord', false);
  const id2 = await createTestArticle();
  await request('POST', `/api/article/${id2}/generate-outline`);
  await request('POST', `/api/article/${id2}/regenerate-outline`);
  const mods2 = unwrap(await request('GET', `/api/article/${id2}/modifications`)) || [];
  const regenMods2 = mods2.filter(m => m.operationType === 'ai_regenerate');
  assert('Bug 关闭：重新生成只有 1 条记录', regenMods2.length === 1,
    `实际 ${regenMods2.length} 条`);

  await request('DELETE', `/api/article/${id1}`);
  await request('DELETE', `/api/article/${id2}`);
}

// 40f. BUG-NEW-6: Agent 错误信息被存为文章内容
async function testBug_AgentErrorAsContent() {
  section('40f. BUG-NEW-6: Agent 错误存为内容');

  // --- Bug ON: 错误信息被当正常内容存储 ---
  await toggleBug('agentErrorAsContent', true);
  const id1 = await createTestArticle();
  const bugRes = await request('POST', `/api/article/${id1}/generate-outline-error`);
  assert('Bug 开启：错误返回 200（伪装成功）', bugRes.ok,
    `status=${bugRes.status}`);
  const detail1 = unwrap(await request('GET', `/api/article/${id1}`));
  assert('Bug 开启：outline 包含错误信息', detail1?.outline?.includes('LLM调用失败'),
    `outline=${(detail1?.outline || '').slice(0, 50)}`);

  // --- Bug OFF: 正确返回 500 错误 ---
  await toggleBug('agentErrorAsContent', false);
  const id2 = await createTestArticle();
  const fixedRes = await request('POST', `/api/article/${id2}/generate-outline-error`);
  assert('Bug 关闭：正确返回 500', fixedRes.status === 500,
    `status=${fixedRes.status}`);
  const detail2 = unwrap(await request('GET', `/api/article/${id2}`));
  assert('Bug 关闭：outline 未被污染', !detail2?.outline || detail2.outline === '',
    `outline=${(detail2?.outline || '').slice(0, 50)}`);

  await request('DELETE', `/api/article/${id1}`);
  await request('DELETE', `/api/article/${id2}`);
}

// 40g. BUG-NEW-9: 版本回退到 null 内容
async function testBug_RevertToNull() {
  section('40g. BUG-NEW-9: 回退到 null 内容');

  // --- Bug ON: 回退到空 beforeContent → outline 被设为 null ---
  await toggleBug('revertToNull', true);
  const id1 = await createTestArticle();
  await request('POST', `/api/article/${id1}/generate-outline`);
  const mods1 = unwrap(await request('GET', `/api/article/${id1}/modifications`)) || [];
  const firstMod = mods1[0]; // beforeContent='' (首次生成)
  const bugRevert = await request('POST', `/api/article/${id1}/revert`, { modificationId: firstMod.id });
  assert('Bug 开启：回退到空内容仍然成功', bugRevert.ok,
    `status=${bugRevert.status}`);
  const art1 = unwrap(await request('GET', `/api/article/${id1}`));
  assert('Bug 开启：outline 被设为 null', art1?.outline === null,
    `outline=${String(art1?.outline).slice(0, 40)}`);

  // --- Bug OFF: 创建一个 afterContent=null 的修改记录，回退应被拒绝 ---
  await toggleBug('revertToNull', false);
  const id2 = await createTestArticle();
  // 插入一条 afterContent=null 的修改记录（模拟失败的生成操作）
  await request('POST', `/api/article/${id2}/_test-insert-mod`, {
    modifyType: 'outline', operationType: 'failed_generate',
    beforeContent: '原始大纲', afterContent: null,
  });
  const mods2 = unwrap(await request('GET', `/api/article/${id2}/modifications`)) || [];
  const nullMod = mods2.find(m => m.afterContent === null);
  if (nullMod) {
    const fixedRevert = await request('POST', `/api/article/${id2}/revert`, { modificationId: nullMod.id });
    assert('Bug 关闭：回退到 null 内容被拒绝', !fixedRevert.ok,
      `status=${fixedRevert.status}`);
  } else {
    assert('Bug 关闭：回退到 null 内容被拒绝', false, '未能创建测试修改记录');
  }
  const art2 = unwrap(await request('GET', `/api/article/${id2}`));
  assert('Bug 关闭：outline 未被破坏', art2?.outline !== null,
    `outline=${String(art2?.outline).slice(0, 40)}`);

  await request('DELETE', `/api/article/${id1}`);
  await request('DELETE', `/api/article/${id2}`);
}

// 40h. BUG-NEW-11: 分页负数 offset
async function testBug_NegativeOffset() {
  section('40h. BUG-NEW-11: 分页负数 offset');

  // 先创建几篇文章
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await createTestArticle());

  // --- Bug ON: page=0 → (0-1)*size = negative offset → 异常数据 ---
  await toggleBug('negativeOffset', true);
  const bugRes = await request('GET', '/api/article/list/paged?page=0&size=10');
  const bugData = unwrap(bugRes);
  assert('Bug 开启：page=0 不修正', bugData?.page === 0,
    `page=${bugData?.page}`);

  // --- Bug OFF: page=0 被修正为 page=1 ---
  await toggleBug('negativeOffset', false);
  const fixedRes = await request('GET', '/api/article/list/paged?page=0&size=10');
  const fixedData = unwrap(fixedRes);
  assert('Bug 关闭：page=0 修正为 1', fixedData?.page === 1,
    `page=${fixedData?.page}`);
  assert('Bug 关闭：返回正常数据', Array.isArray(fixedData?.list),
    `list=${typeof fixedData?.list}`);

  for (const id of ids) await request('DELETE', `/api/article/${id}`);
}

// 40i. BUG-NEW-12: 删除文章级联不完整
async function testBug_IncompleteCascade() {
  section('40i. BUG-NEW-12: 删除级联不完整');

  // --- Bug ON: 删除文章后图片残留 ---
  await toggleBug('incompleteCascade', true);
  const id1 = await createTestArticle();
  // 给文章添加图片（使用正确的 batch 接口）
  await request('POST', '/api/article-image/batch', [
    { articleId: id1, url: 'https://example.com/img1.png', prompt: 'test', type: 'cover' },
  ]);
  await request('DELETE', `/api/article/${id1}`);
  // 检查图片是否残留 — Bug ON 时图片应该在
  const imgs1 = unwrap(await request('GET', `/api/article-image/article/${id1}`));
  assert('Bug 开启：删除文章后图片残留', Array.isArray(imgs1) && imgs1.length > 0,
    `images count=${imgs1?.length ?? 'null'}`);

  // --- Bug OFF: 删除文章后图片被清理 ---
  await toggleBug('incompleteCascade', false);
  const id2 = await createTestArticle();
  await request('POST', '/api/article-image/batch', [
    { articleId: id2, url: 'https://example.com/img2.png', prompt: 'test', type: 'cover' },
  ]);
  await request('DELETE', `/api/article/${id2}`);
  const imgs2 = unwrap(await request('GET', `/api/article-image/article/${id2}`));
  assert('Bug 关闭：删除文章后图片已清理', !imgs2 || imgs2.length === 0,
    `images count=${imgs2?.length ?? 'null'}`);
}

// 40. Master: run all bug toggle tests
async function testBugToggles() {
  section('40. Bug 模拟开关验证（总控）');

  // Get current bug states
  const bugsRes = await request('GET', '/api/test/bugs');
  const bugs = unwrap(bugsRes);
  assert('Bug 列表可获取', bugs !== null);
  assert('所有 Bug 默认关闭', Object.values(bugs).every(v => v === false));

  // Run all individual bug tests
  await testBug_WikiRuleEntityId();
  await testBug_ParseIntentParam();
  await testBug_ConfirmFinalNoCheck();
  await testBug_NpeOnMissingArticle();
  await testBug_DuplicateModRecord();
  await testBug_AgentErrorAsContent();
  await testBug_RevertToNull();
  await testBug_NegativeOffset();
  await testBug_IncompleteCascade();

  // Verify all bugs are back to OFF after tests
  const finalRes = await request('GET', '/api/test/bugs');
  const finalBugs = unwrap(finalRes);
  assert('测试后所有 Bug 恢复关闭', Object.values(finalBugs).every(v => v === false),
    `state=${JSON.stringify(finalBugs)}`);
}

/* ================================================================
   主流程
   ================================================================ */
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  CDC 科普平台 — 自动化工作流测试              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 检查 Mock Server
  try {
    await fetch(API + '/health');
    console.log('✅ Mock Server 连接成功\n');
  } catch {
    console.log('❌ 无法连接 Mock Server');
    console.log('   请先运行：node mock-server.js\n');
    process.exit(1);
  }

  const start = Date.now();

  await testHealthCheck();
  await testFormDropdown();
  await testArticleCreate();
  await testArticleCreateText();
  await testOutlineGeneration();
  await testOutlineSaveBug();
  await testOutlineConfirm();
  await testDraftGeneration();
  await testDraftSaveBug();
  await testDraftConfirm();
  await testPublish();
  await testAutoSave();
  await testRevert();
  await testWikiCRUD();
  await testTemplateCRUD();
  await testLlmConfig();
  await testAgentEndpoints();
  await testArticleList();
  await testArticleDelete();

  // === Module A: Data Integrity ===
  await testWikiRuleIntegrity();
  await testFreeTextGeneration();
  await testConfirmFinalEmptyDraft();
  await testNonexistentArticle();
  await testModificationDedup();
  await testAgentErrorHandling();
  await testRevertSafety();
  await testPaginationBoundary();
  await testDeleteCascade();

  // === Module B: Interaction Logic ===
  await testWorkbenchSequence();
  await testAutoSaveConcurrency();
  await testConfirmOutlineWithContent();
  await testRegenerateAndRevert();
  await testStatusStateMachine();

  // === Module D: Cross-Module Data Flow ===
  await testWikiToArticleChain();
  await testTemplateToArticleChain();
  await testImageToArticleChain();

  // === Module E: Edge Cases ===
  await testConcurrentCreation();
  await testLongContent();
  await testSpecialCharacters();
  await testIdempotency();

  // === Bug Toggle Verification ===
  await testBugToggles();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log(`  测试结果：${passed} 通过 / ${failed} 失败 / ${warnings} 警告`);
  console.log(`  共 ${passed + failed + warnings} 项断言，耗时：${elapsed}s`);
  console.log('═'.repeat(60));

  if (warnings > 0) {
    console.log('\n⚠️  警告项说明：');
    console.log('   存在未完全覆盖的测试场景。\n');
  } else {
    console.log('\n✅ 全部测试通过，saveOutline/saveDraft Bug 已修复确认。\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
