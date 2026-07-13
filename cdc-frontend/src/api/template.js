import { get, post, put, del } from './index.js';
import {
  normalizePagedTemplates,
  normalizeTemplate,
  serializeTemplate,
} from './normalize.js';

export const listTemplates = async () => {
  const data = await get('/template/list');
  return Array.isArray(data) ? data.map(normalizeTemplate) : [];
};

export const listTemplatesPaged = (page, size) =>
  get(`/template/list/paged?page=${page}&size=${size}`).then(normalizePagedTemplates);

export const getTemplate = (id) => get(`/template/${id}`).then(normalizeTemplate);

export const addTemplate = (template) =>
  post('/template', serializeTemplate(template)).then(normalizeTemplate);

export const updateTemplate = (id, template) =>
  put(`/template/${id}`, serializeTemplate(template)).then(normalizeTemplate);

export const deleteTemplate = (id) => del(`/template/${id}`);
