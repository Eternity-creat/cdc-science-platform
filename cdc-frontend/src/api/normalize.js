import { normalizeImageSrc, normalizeLineBreaks } from '../lib/content.js';

export function normalizeDate(value) {
  return value || null;
}

export function normalizeNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value, fallback = '') {
  return value == null ? fallback : String(value);
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .split(/\n|[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function stringifyJsonArray(value) {
  return JSON.stringify(asArray(value).map((item) => String(item).trim()).filter(Boolean));
}

export function normalizePage(page = {}, itemNormalizer = (item) => item) {
  return {
    ...page,
    list: asArray(page.list).map(itemNormalizer),
    total: normalizeNumber(page.total, 0),
    page: normalizeNumber(page.page, 1),
    size: normalizeNumber(page.size, 10),
    totalPages: normalizeNumber(page.totalPages ?? page.pages, 1),
  };
}

export function normalizeArticleSummary(article = {}) {
  return {
    ...article,
    id: normalizeNumber(article.id, null),
    requestId: normalizeNumber(article.requestId ?? article.request_id, null),
    entityName: normalizeText(article.entityName || article.entity_name || article.entity?.stdName || article.userText || article.user_text),
    entityType: normalizeNumber(article.entityType ?? article.entity_type, 0),
    templateName: normalizeText(article.templateName || article.template_name || article.template?.templateName),
    status: article.status == null ? null : normalizeNumber(article.status, null),
    mode: article.mode == null ? null : normalizeNumber(article.mode, null),
    modifyCount: normalizeNumber(article.modifyCount ?? article.modify_count, 0),
    createTime: normalizeDate(article.createTime || article.create_time || article.createdAt || article.created_at),
    updateTime: normalizeDate(article.updateTime || article.update_time || article.updatedAt || article.updated_at),
    userText: normalizeText(article.userText || article.user_text),
  };
}

export function normalizePagedArticles(page = {}) {
  return normalizePage(page, normalizeArticleSummary);
}

export function normalizeArticleDetail(article = {}) {
  return {
    ...article,
    id: normalizeNumber(article.id, null),
    requestId: normalizeNumber(article.requestId ?? article.request_id, null),
    templateId: normalizeNumber(article.templateId ?? article.template_id, null),
    status: article.status == null ? null : normalizeNumber(article.status, null),
    outline: normalizeLineBreaks(article.outline),
    initialDraft: normalizeLineBreaks(article.initialDraft ?? article.initial_draft),
    finalArticle: normalizeLineBreaks(article.finalArticle ?? article.final_article),
    coverImage: normalizeImageSrc(article.coverImage || article.cover_image || ''),
    images: parseJsonArray(article.images),
    qualityScore: article.qualityScore ?? article.quality_score ?? null,
    readabilityLevel: article.readabilityLevel || article.readability_level || '',
    generationMeta: article.generationMeta ?? article.generation_meta ?? null,
    createTime: normalizeDate(article.createTime || article.create_time || article.createdAt || article.created_at),
    updateTime: normalizeDate(article.updateTime || article.update_time || article.updatedAt || article.updated_at),
  };
}

export function normalizeModification(mod = {}) {
  return {
    ...mod,
    id: normalizeNumber(mod.id, null),
    articleId: normalizeNumber(mod.articleId ?? mod.article_id, null),
    modifyType: mod.modifyType || mod.modify_type || mod.type || '',
    operationType: mod.operationType || mod.operation_type || mod.operation || 'manual_edit',
    beforeContent: normalizeLineBreaks(mod.beforeContent ?? mod.before_content ?? mod.before),
    afterContent: normalizeLineBreaks(mod.afterContent ?? mod.after_content ?? mod.after),
    modifyTime: normalizeDate(mod.modifyTime || mod.modify_time || mod.createdAt || mod.created_at),
  };
}

export function normalizeTrace(trace = {}) {
  return {
    ...trace,
    id: normalizeNumber(trace.id, null),
    articleId: normalizeNumber(trace.articleId ?? trace.article_id, null),
    stepName: trace.stepName || trace.step_name || '',
    costTime: trace.costTime ?? trace.cost_time ?? null,
    stepContent: trace.stepContent ?? trace.step_content ?? '',
    modelUsed: trace.modelUsed || trace.model_used || '',
    tokenUsage: trace.tokenUsage ?? trace.token_usage ?? null,
    qualityMetrics: trace.qualityMetrics ?? trace.quality_metrics ?? null,
    createTime: normalizeDate(trace.createTime || trace.create_time || trace.createdAt || trace.created_at),
  };
}

export function normalizeTemplate(template = {}) {
  return {
    ...template,
    id: normalizeNumber(template.id, null),
    templateName: normalizeText(template.templateName || template.template_name),
    tag: normalizeText(template.tag),
    purpose: normalizeText(template.purpose),
    tone: template.tone ?? '',
    outlineStructure: template.outlineStructure ?? template.outline_structure ?? '[]',
    status: template.status == null ? 1 : normalizeNumber(template.status, 1),
    createTime: normalizeDate(template.createTime || template.create_time || template.createdAt || template.created_at),
  };
}

export function normalizePagedTemplates(page = {}) {
  return normalizePage(page, normalizeTemplate);
}

export function serializeTemplate(template = {}) {
  const outlineStructure = Array.isArray(template.outlineStructure)
    ? stringifyJsonArray(template.outlineStructure)
    : normalizeText(template.outlineStructure || '[]').trim().startsWith('[')
      ? normalizeText(template.outlineStructure || '[]')
      : stringifyJsonArray(parseJsonArray(template.outlineStructure));

  return {
    id: template.id ?? null,
    templateName: normalizeText(template.templateName).trim(),
    tag: normalizeText(template.tag),
    purpose: normalizeText(template.purpose),
    tone: template.tone ?? '',
    outlineStructure,
    status: normalizeNumber(template.status, 1),
  };
}

export function normalizeWikiEntity(entity = {}) {
  return {
    ...entity,
    id: normalizeNumber(entity.id, null),
    entityType: normalizeNumber(entity.entityType ?? entity.entity_type, 0),
    stdName: normalizeText(entity.stdName || entity.std_name),
    alias: entity.alias ?? '',
    aliasList: parseJsonArray(entity.alias),
    summary: normalizeText(entity.summary),
    segments: asArray(entity.segments).map(normalizeWikiSegment),
    rules: asArray(entity.rules).map(normalizeWikiRule),
    relatedIds: asArray(entity.relatedIds || entity.related_ids).map((id) => normalizeNumber(id, null)).filter((id) => id != null),
    createTime: normalizeDate(entity.createTime || entity.create_time || entity.createdAt || entity.created_at),
    updateTime: normalizeDate(entity.updateTime || entity.update_time || entity.updatedAt || entity.updated_at),
  };
}

export function normalizePagedWiki(page = {}) {
  return normalizePage(page, normalizeWikiEntity);
}

export function normalizeWikiSegment(segment = {}) {
  return {
    ...segment,
    id: normalizeNumber(segment.id, null),
    entityId: normalizeNumber(segment.entityId ?? segment.entity_id, null),
    content: normalizeText(segment.content),
    source: normalizeText(segment.source),
    createTime: normalizeDate(segment.createTime || segment.create_time || segment.createdAt || segment.created_at),
  };
}

export function normalizeWikiRule(rule = {}) {
  return {
    ...rule,
    id: normalizeNumber(rule.id, null),
    entityId: normalizeNumber(rule.entityId ?? rule.entity_id, null),
    ruleType: rule.ruleType || rule.rule_type || 'MustInclude',
    content: normalizeText(rule.content),
    applyEntityIds: rule.applyEntityIds ?? rule.apply_entity_ids ?? '',
    status: rule.status == null ? 1 : normalizeNumber(rule.status, 1),
    createTime: normalizeDate(rule.createTime || rule.create_time || rule.createdAt || rule.created_at),
  };
}

export function serializeWikiEntity(entity = {}) {
  const rawAlias = normalizeText(entity.alias);
  const alias = Array.isArray(entity.alias)
    ? stringifyJsonArray(entity.alias)
    : rawAlias.trim().startsWith('[')
      ? rawAlias
      : stringifyJsonArray(parseJsonArray(rawAlias));
  return {
    id: entity.id ?? null,
    entityType: normalizeNumber(entity.entityType, 1),
    stdName: normalizeText(entity.stdName).trim(),
    alias,
    summary: normalizeText(entity.summary),
  };
}

export function serializeWikiSegment(segment = {}) {
  return {
    id: segment.id ?? null,
    entityId: normalizeNumber(segment.entityId, null),
    content: normalizeText(segment.content).trim(),
    source: normalizeText(segment.source),
  };
}

export function serializeWikiRule(rule = {}) {
  return {
    id: rule.id ?? null,
    entityId: normalizeNumber(rule.entityId, null),
    ruleType: rule.ruleType || 'MustInclude',
    content: normalizeText(rule.content).trim(),
    applyEntityIds: rule.applyEntityIds ?? '',
    status: rule.status == null ? 1 : normalizeNumber(rule.status, 1),
  };
}

export function normalizeLlmConfig(config = {}) {
  return {
    ...config,
    id: normalizeNumber(config.id, null),
    configName: normalizeText(config.configName || config.config_name),
    configType: normalizeText(config.configType || config.config_type),
    provider: normalizeText(config.provider || 'dashscope'),
    modelName: normalizeText(config.modelName || config.model_name),
    apiKeyEncrypted: normalizeText(config.apiKeyEncrypted || config.api_key_encrypted),
    baseUrl: normalizeText(config.baseUrl || config.base_url),
    params: config.params == null ? '' : (typeof config.params === 'string' ? config.params : JSON.stringify(config.params)),
    isDefault: normalizeNumber(config.isDefault ?? config.is_default, 0),
    isEnabled: normalizeNumber(config.isEnabled ?? config.is_enabled, 1),
    description: normalizeText(config.description),
    createdAt: normalizeDate(config.createdAt || config.created_at || config.createTime || config.create_time),
    updatedAt: normalizeDate(config.updatedAt || config.updated_at || config.updateTime || config.update_time),
  };
}

export function serializeLlmConfig(config = {}) {
  return {
    id: config.id ?? null,
    configName: normalizeText(config.configName).trim(),
    configType: normalizeText(config.configType),
    provider: normalizeText(config.provider || 'dashscope'),
    modelName: normalizeText(config.modelName).trim(),
    apiKeyEncrypted: normalizeText(config.apiKeyEncrypted),
    baseUrl: normalizeText(config.baseUrl),
    params: config.params == null ? '' : (typeof config.params === 'string' ? config.params : JSON.stringify(config.params)),
    isDefault: normalizeNumber(config.isDefault, 0),
    isEnabled: normalizeNumber(config.isEnabled, 1),
    description: normalizeText(config.description),
  };
}

export function normalizeContext(context = null) {
  if (!context) return null;
  return {
    ...context,
    entity: context.entity ? normalizeWikiEntity(context.entity) : null,
    template: context.template ? normalizeTemplate(context.template) : null,
    segments: asArray(context.segments).map(normalizeWikiSegment),
    mustInclude: asArray(context.mustInclude || context.must_include),
    mustNotSay: asArray(context.mustNotSay || context.must_not_say),
  };
}

export function normalizeGalleryImage(image = {}) {
  return {
    ...image,
    id: normalizeNumber(image.id, null),
    articleId: normalizeNumber(image.articleId ?? image.article_id, null),
    imageKey: image.imageKey || image.image_key || '',
    filePath: normalizeImageSrc(image.filePath || image.file_path || image.url || ''),
    caption: image.caption || '',
    position: image.position == null ? null : normalizeNumber(image.position, null),
    generatedBy: image.generatedBy || image.generated_by || '',
    generationPrompt: image.generationPrompt || image.generation_prompt || '',
    width: image.width == null ? null : normalizeNumber(image.width, null),
    height: image.height == null ? null : normalizeNumber(image.height, null),
    fileSize: image.fileSize ?? image.file_size ?? null,
    status: image.status == null ? 1 : normalizeNumber(image.status, 1),
    createdAt: normalizeDate(image.createdAt || image.created_at || image.createTime || image.create_time),
    updatedAt: normalizeDate(image.updatedAt || image.updated_at || image.updateTime || image.update_time),
  };
}

export function serializeGalleryImage(image = {}) {
  return {
    id: image.id ?? null,
    articleId: normalizeNumber(image.articleId, null),
    imageKey: normalizeText(image.imageKey),
    filePath: normalizeText(image.filePath),
    caption: normalizeText(image.caption),
    position: image.position == null ? 0 : normalizeNumber(image.position, 0),
    generatedBy: normalizeText(image.generatedBy),
    generationPrompt: normalizeText(image.generationPrompt),
    width: image.width == null ? null : normalizeNumber(image.width, null),
    height: image.height == null ? null : normalizeNumber(image.height, null),
    fileSize: image.fileSize == null ? null : normalizeNumber(image.fileSize, null),
    status: image.status == null ? 1 : normalizeNumber(image.status, 1),
  };
}

export function serializeArticleCreateRequest(request = {}) {
  return {
    mode: normalizeNumber(request.mode, 1),
    entityType: normalizeNumber(request.entityType, null),
    entityId: normalizeNumber(request.entityId, null),
    populationId: request.populationId == null || request.populationId === '' ? null : normalizeNumber(request.populationId, null),
    sceneId: request.sceneId == null || request.sceneId === '' ? null : normalizeNumber(request.sceneId, null),
    templateId: normalizeNumber(request.templateId, null),
    wordCount: normalizeNumber(request.wordCount, 800),
  };
}

export function serializeTextCreateRequest(userText, templateId) {
  return {
    userText: normalizeText(userText).trim(),
    templateId: normalizeNumber(templateId, 1),
  };
}

export function normalizeCreateResult(result = {}) {
  return {
    ...result,
    articleId: normalizeNumber(result.articleId ?? result.article_id ?? result.id, null),
    status: result.status == null ? null : normalizeNumber(result.status, null),
    context: normalizeContext(result.context),
  };
}

export function normalizeFormDropdown(dropdown = {}) {
  return {
    diseaseList: asArray(dropdown.diseaseList || dropdown.disease_list).map(normalizeWikiEntity),
    vaccineList: asArray(dropdown.vaccineList || dropdown.vaccine_list).map(normalizeWikiEntity),
    populationList: asArray(dropdown.populationList || dropdown.population_list).map(normalizeWikiEntity),
    sceneList: asArray(dropdown.sceneList || dropdown.scene_list).map(normalizeWikiEntity),
    templateList: asArray(dropdown.templateList || dropdown.template_list).map(normalizeTemplate),
  };
}

export function normalizeAgentIntent(intent = {}) {
  return {
    ...intent,
    entityType: intent.entityType ?? intent.entity_type ?? null,
    entityName: intent.entityName || intent.entity_name || '',
    populationName: intent.populationName || intent.population_name || '',
    sceneName: intent.sceneName || intent.scene_name || '',
    wordCount: intent.wordCount ?? intent.word_count ?? null,
  };
}

export function serializeAgentIntentRequest(userText) {
  return { user_text: normalizeText(userText).trim() };
}

export function serializeAgentImageRequest({ articleId, draftContent, style = 'health_science', maxImages = 1 } = {}) {
  return {
    article_id: articleId ? normalizeNumber(articleId, null) : null,
    draft_content: normalizeText(draftContent),
    style,
    max_images: normalizeNumber(maxImages, 1),
  };
}
