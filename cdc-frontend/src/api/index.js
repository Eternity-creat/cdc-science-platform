/**
 * Base HTTP client for CDC backend API.
 * Backend returns { code: 200, msg: "success", data: T }
 */

const BASE_URL = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();

  if (json.code !== 200) {
    throw new Error(json.msg || '请求失败');
  }

  return json.data;
}

export const get = (url) => request(url);

export const post = (url, data) =>
  request(url, { method: 'POST', body: JSON.stringify(data) });

export const put = (url, data) =>
  request(url, { method: 'PUT', body: JSON.stringify(data) });

export const del = (url) => request(url, { method: 'DELETE' });

export const putRaw = (url, rawString) =>
  request(url, {
    method: 'PUT',
    body: JSON.stringify(rawString),
  });
