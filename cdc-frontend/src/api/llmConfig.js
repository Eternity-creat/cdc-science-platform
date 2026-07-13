import { get, post, put, del } from './index.js';
import { normalizeLlmConfig, serializeLlmConfig } from './normalize.js';

const normalizeConfigList = (data) => Array.isArray(data) ? data.map(normalizeLlmConfig) : [];

export const listConfigs = () => get('/llm-config').then(normalizeConfigList);
export const listByType = (type) => get(`/llm-config/type/${type}`).then(normalizeConfigList);
export const getConfig = (id) => get(`/llm-config/${id}`).then(normalizeLlmConfig);
export const getDefaultConfig = (type) => get(`/llm-config/default/${type}`).then(normalizeLlmConfig);
export const addConfig = (data) => post('/llm-config', serializeLlmConfig(data)).then(normalizeLlmConfig);
export const updateConfig = (id, data) => put(`/llm-config/${id}`, serializeLlmConfig(data)).then(normalizeLlmConfig);
export const deleteConfig = (id) => del(`/llm-config/${id}`);
export const setDefaultConfig = (id) => put(`/llm-config/${id}/set-default`, {}).then(normalizeLlmConfig);
