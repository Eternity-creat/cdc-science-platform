import { get, post, put, del } from './index.js';

/** 查询所有模板 */
export const listTemplates = () => get(`/template/list`);

/** 分页查询模板 */
export const listTemplatesPaged = (page, size) =>
  get(`/template/list/paged?page=${page}&size=${size}`);

/** 查询单个模板详情 */
export const getTemplate = (id) => get(`/template/${id}`);

/** 新增模板 */
export const addTemplate = (template) => post(`/template`, template);

/** 修改模板 */
export const updateTemplate = (id, template) => put(`/template/${id}`, template);

/** 删除模板 */
export const deleteTemplate = (id) => del(`/template/${id}`);
