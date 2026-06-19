import { get, post, put, del } from './index.js';

export const listConfigs = () => get('/llm-config');
export const listByType = (type) => get(`/llm-config/type/${type}`);
export const getConfig = (id) => get(`/llm-config/${id}`);
export const getDefaultConfig = (type) => get(`/llm-config/default/${type}`);
export const addConfig = (data) => post('/llm-config', data);
export const updateConfig = (id, data) => put(`/llm-config/${id}`, data);
export const deleteConfig = (id) => del(`/llm-config/${id}`);
export const setDefaultConfig = (id) => put(`/llm-config/${id}/set-default`, {});
