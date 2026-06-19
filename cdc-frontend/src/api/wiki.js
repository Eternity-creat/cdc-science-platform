import { get, post, put, del } from './index.js';

/** 查询所有实体（含详情） */
export const listWikiEntities = () => get(`/wiki/list`);

/** 分页查询实体 */
export const listWikiPaged = (page, size, type, keyword) => {
  const params = new URLSearchParams({ page, size });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  return get(`/wiki/list/paged?${params}`);
};

/** 查询单个实体详情 */
export const getWikiEntity = (id) => get(`/wiki/${id}`);

/** 新增实体 */
export const addWikiEntity = (entity) => post(`/wiki`, entity);

/** 修改实体 */
export const updateWikiEntity = (id, entity) => put(`/wiki/${id}`, entity);

/** 删除实体 */
export const deleteWikiEntity = (id) => del(`/wiki/${id}`);

// ===== 片段 Segment =====
export const addSegment = (segment) => post(`/wiki/segment`, segment);
export const updateSegment = (id, segment) => put(`/wiki/segment/${id}`, segment);
export const deleteSegment = (id) => del(`/wiki/segment/${id}`);

/** 查询实体的所有片段及其预计算 embedding 向量（用于传给 Agent 做 top-k 检索） */
export const listSegmentsWithEmbeddings = (entityId) => get(`/wiki/entity/${entityId}/segments-with-embeddings`);

// ===== 规则 Rule =====
export const addRule = (rule) => post(`/wiki/rule`, rule);
export const updateRule = (id, rule) => put(`/wiki/rule/${id}`, rule);
export const deleteRule = (id) => del(`/wiki/rule/${id}`);

// ===== 关联 Relation =====
export const addRelation = (relation) => post(`/wiki/relation`, relation);
export const updateRelation = (id, relation) => put(`/wiki/relation/${id}`, relation);
export const deleteRelation = (id) => del(`/wiki/relation/${id}`);
