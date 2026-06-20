import { get, post, put, putRaw, del } from './index.js';

/** 文章列表（含模板名、实体名、修改次数） */
export const listArticles = () => get(`/article/list`);

/** 文章列表（分页） */
export const listArticlesPaged = (page, size, status, keyword) => {
  const params = new URLSearchParams({ page, size });
  if (status) params.set('status', status);
  if (keyword) params.set('keyword', keyword);
  return get(`/article/list/paged?${params}`);
};

/** 获取文章详情 */
export const getArticle = (id) => get(`/article/${id}`);

/** 删除文章（级联清理留痕 + 轨迹） */
export const deleteArticle = (id) => del(`/article/${id}`);

/** AI 生成大纲 */
export const generateOutline = (id) => post(`/article/${id}/generate-outline`);

/** AI 生成初稿 */
export const generateDraft = (id) => post(`/article/${id}/generate-draft`);

/** 保存大纲（自动留痕） */
export const saveOutline = (id, content) => putRaw(`/article/${id}/outline`, content);

/** 保存初稿（自动留痕） */
export const saveDraft = (id, content) => putRaw(`/article/${id}/draft`, content);

/** 确认大纲（保存大纲，状态保持 2，前端随后调 generateDraft） */
export const confirmOutline = (id, content) => post(`/article/${id}/confirm-outline`, content);

/** 确认初稿为终稿（status 3 → 4） */
export const confirmDraft = (id) => post(`/article/${id}/confirm-draft`);

/** 重新生成大纲（保留旧版本到修改历史） */
export const regenerateOutline = (id) => post(`/article/${id}/regenerate-outline`);

/** 重新生成初稿（保留旧版本到修改历史） */
export const regenerateDraft = (id) => post(`/article/${id}/regenerate-draft`);

/** 自动保存（轻量，不记录修改历史） */
export const autoSave = (id, field, content) =>
  post(`/article/${id}/autosave`, { field, content });

/** 回退到历史版本 */
export const revertToModification = (id, modificationId) =>
  post(`/article/${id}/revert`, { modificationId });

/** 确认终稿（兼容旧接口） */
export const confirmFinal = (id) => post(`/article/${id}/confirm`);

/** 获取修改记录 */
export const getModifications = (id) => get(`/article/${id}/modifications`);

/** 获取 Agent 轨迹 */
export const getTrace = (id) => get(`/article/${id}/trace`);

/** 表单提交创建文章 */
export const createArticle = (request) => post(`/article/generate`, request);

/** 自由文本创建文章 */
export const generateFromText = (userText, templateId) =>
  post(`/article/generate/text`, { userText, templateId });

/** 获取文章上下文 */
export const getArticleContext = (id) => get(`/article/context/${id}`);

/** 获取表单下拉选项 */
export const getFormDropdown = () => get(`/article/form/dropdown`);

/** 获取表单提交记录 */
export const getRecord = (id) => get(`/article/record/${id}`);

/** 获取全部表单提交记录 */
export const listRecords = () => get(`/article/record/list`);

/** FE-3 fix: 调用 Agent 意图解析接口（自由文本 → 结构化参数） */
export const parseIntent = (userText) => post(`/agent/parse-intent`, { user_text: userText });
