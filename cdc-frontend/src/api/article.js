import { get, post, postRaw, put, putRaw, del } from './index.js';
import { streamWithFallback } from './sse.js';
import {
  normalizeArticleDetail,
  normalizeArticleSummary,
  normalizeAgentIntent,
  normalizeCreateResult,
  normalizeContext,
  normalizeFormDropdown,
  normalizeModification,
  normalizePagedArticles,
  normalizeTrace,
  serializeAgentIntentRequest,
  serializeArticleCreateRequest,
  serializeTextCreateRequest,
} from './normalize.js';

const BASE_URL = '/api';

async function agentPost(url, data) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const json = await res.json();
      message = json.detail || json.msg || message;
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return res.json();
}

/** 文章列表（含模板名、实体名、修改次数） */
export const listArticles = async () => {
  const data = await get(`/article/list`);
  return Array.isArray(data) ? data.map(normalizeArticleSummary) : [];
};

/** 文章列表（分页） */
export const listArticlesPaged = async (page, size, status, keyword) => {
  const params = new URLSearchParams({ page, size });
  if (status) params.set('status', status);
  if (keyword) params.set('keyword', keyword);
  return normalizePagedArticles(await get(`/article/list/paged?${params}`));
};

/** 获取文章详情 */
export const getArticle = async (id) => normalizeArticleDetail(await get(`/article/${id}`));

/** 删除文章（级联清理留痕 + 轨迹） */
export const deleteArticle = (id) => del(`/article/${id}`);

/** AI 生成大纲 */
export const generateOutline = (id) => post(`/article/${id}/generate-outline`);
export const generateOutlineStream = (id, options) =>
  streamWithFallback(`/article/${id}/generate-outline/stream`, () => generateOutline(id), options);

/** AI 生成初稿 */
export const generateDraft = (id) => post(`/article/${id}/generate-draft`);
export const generateDraftStream = (id, options) =>
  streamWithFallback(`/article/${id}/generate-draft/stream`, () => generateDraft(id), options);

/** 保存大纲（自动留痕） */
export const saveOutline = (id, content) => putRaw(`/article/${id}/outline`, content);

/** 保存初稿（自动留痕） */
export const saveDraft = (id, content) => putRaw(`/article/${id}/draft`, content);

/** 确认大纲（保存大纲，状态保持 2，前端随后调 generateDraft） */
export const confirmOutline = (id, content) => postRaw(`/article/${id}/confirm-outline`, content);

/** 确认初稿为终稿（status 3 → 4） */
export const confirmDraft = (id) => post(`/article/${id}/confirm-draft`);

/** 重新生成大纲（保留旧版本到修改历史） */
export const regenerateOutline = (id) => post(`/article/${id}/regenerate-outline`);
export const regenerateOutlineStream = (id, options) =>
  streamWithFallback(`/article/${id}/regenerate-outline/stream`, () => regenerateOutline(id), options);

/** 重新生成初稿（保留旧版本到修改历史） */
export const regenerateDraft = (id) => post(`/article/${id}/regenerate-draft`);
export const regenerateDraftStream = (id, options) =>
  streamWithFallback(`/article/${id}/regenerate-draft/stream`, () => regenerateDraft(id), options);

/** 自动保存（轻量，不记录修改历史） */
export const autoSave = (id, field, content) =>
  post(`/article/${id}/autosave`, { field, content });

/** 回退到历史版本 */
export const revertToModification = (id, modificationId) =>
  post(`/article/${id}/revert`, { modificationId });

/** 确认终稿（兼容旧接口） */
export const confirmFinal = (id) => post(`/article/${id}/confirm`);

/** 获取修改记录 */
export const getModifications = async (id) => {
  const data = await get(`/article/${id}/modifications`);
  return Array.isArray(data) ? data.map(normalizeModification) : [];
};

/** 获取 Agent 轨迹 */
export const getTrace = async (id) => {
  const data = await get(`/article/${id}/trace`);
  return Array.isArray(data) ? data.map(normalizeTrace) : [];
};

/** 表单提交创建文章 */
export const createArticle = async (request) =>
  normalizeCreateResult(await post(`/article/generate`, serializeArticleCreateRequest(request)));

/** 自由文本创建文章 */
export const generateFromText = async (userText, templateId) =>
  normalizeCreateResult(await post(`/article/generate/text`, serializeTextCreateRequest(userText, templateId)));

/** 获取文章上下文 */
export const getArticleContext = async (id) => normalizeContext(await get(`/article/context/${id}`));

/** 获取表单下拉选项 */
export const getFormDropdown = async () => normalizeFormDropdown(await get(`/article/form/dropdown`));

/** 获取表单提交记录 */
export const getRecord = (id) => get(`/article/record/${id}`);

/** 获取全部表单提交记录 */
export const listRecords = () => get(`/article/record/list`);

/** FE-3 fix: 调用 Agent 意图解析接口（自由文本 → 结构化参数） */
export const parseIntent = async (userText) =>
  normalizeAgentIntent(await agentPost(`/agent/parse-intent`, serializeAgentIntentRequest(userText)));
