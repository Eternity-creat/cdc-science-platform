/**
 * Base HTTP client for CDC backend API.
 * Backend returns { code: 200, msg: "success", data: T }
 */

const BASE_URL = '/api';
const DEFAULT_TIMEOUT = 600000; // 600s, aligned with Nginx proxy_read_timeout

async function request(url, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const { timeout: _, ...fetchOptions } = options;
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const res = await fetch(`${BASE_URL}${url}`, {
      ...fetchOptions,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.code !== 200) {
      throw new Error(json.msg || '请求失败');
    }

    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，AI 正在生成内容，请稍后刷新页面查看结果');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const get = (url) => request(url);

export const post = (url, data) =>
  request(url, { method: 'POST', body: JSON.stringify(data) });

export const put = (url, data) =>
  request(url, { method: 'PUT', body: JSON.stringify(data) });

export const del = (url) => request(url, { method: 'DELETE' });

export const postForm = (url, formData) =>
  request(url, { method: 'POST', body: formData });

export const putRaw = (url, rawString) =>
  request(url, {
    method: 'PUT',
    body: JSON.stringify(rawString),
  });
