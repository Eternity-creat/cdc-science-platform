import { get, post, put, del, postForm } from './index.js';
import {
  normalizePagedWiki,
  normalizeWikiEntity,
  normalizeWikiRule,
  normalizeWikiSegment,
  serializeWikiEntity,
  serializeWikiRule,
  serializeWikiSegment,
} from './normalize.js';

export const listWikiEntities = async () => {
  const data = await get('/wiki/list');
  return Array.isArray(data) ? data.map(normalizeWikiEntity) : [];
};

export const listWikiPaged = (page, size, type, keyword) => {
  const params = new URLSearchParams({ page, size });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  return get(`/wiki/list/paged?${params}`).then(normalizePagedWiki);
};

export const getWikiEntity = (id) => get(`/wiki/${id}`).then(normalizeWikiEntity);
export const addWikiEntity = (entity) => post('/wiki', serializeWikiEntity(entity)).then(normalizeWikiEntity);
export const updateWikiEntity = (id, entity) => put(`/wiki/${id}`, serializeWikiEntity(entity)).then(normalizeWikiEntity);
export const deleteWikiEntity = (id) => del(`/wiki/${id}`);

export const addSegment = (segment) => post('/wiki/segment', serializeWikiSegment(segment)).then(normalizeWikiSegment);
export const updateSegment = (id, segment) => put(`/wiki/segment/${id}`, serializeWikiSegment(segment)).then(normalizeWikiSegment);
export const deleteSegment = (id) => del(`/wiki/segment/${id}`);

export const listSegmentsWithEmbeddings = (entityId) =>
  get(`/wiki/entity/${entityId}/segments-with-embeddings`).then((data) =>
    Array.isArray(data) ? data.map(normalizeWikiSegment) : []
  );

export const addRule = (rule) => post('/wiki/rule', serializeWikiRule(rule)).then(normalizeWikiRule);
export const updateRule = (id, rule) => put(`/wiki/rule/${id}`, serializeWikiRule(rule)).then(normalizeWikiRule);
export const deleteRule = (id) => del(`/wiki/rule/${id}`);

export const addRelation = (relation) => post('/wiki/relation', relation);
export const updateRelation = (id, relation) => put(`/wiki/relation/${id}`, relation);
export const deleteRelation = (id) => del(`/wiki/relation/${id}`);
export const uploadWikiDocument = (file, entityType = 1) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', String(entityType || 1));
  return postForm('/wiki/upload', formData);
};

export const getUploadPreview = (taskId) => get(`/wiki/upload/${taskId}`);
export const confirmUpload = (taskId) => post(`/wiki/upload/${taskId}/confirm`);
