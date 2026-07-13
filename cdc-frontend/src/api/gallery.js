import { get, post, put, del } from './index.js';
import {
  normalizeGalleryImage,
  serializeAgentImageRequest,
  serializeGalleryImage,
} from './normalize.js';

const BASE_URL = '/api';

/**
 * Agent 端请求（返回原始 JSON，不包装 {code, data}）
 */
async function agentPost(url, data) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * 获取文章的所有配图
 */
export function listImages(articleId) {
  return get(`/article-image/article/${articleId}`).then((data) =>
    Array.isArray(data) ? data.map(normalizeGalleryImage) : []
  );
}

/**
 * 获取单张图片详情
 */
export function getImage(id) {
  return get(`/article-image/${id}`).then(normalizeGalleryImage);
}

/**
 * 保存单张图片
 */
export function saveImage(data) {
  return post('/article-image', serializeGalleryImage(data)).then(normalizeGalleryImage);
}

/**
 * 批量保存图片
 */
export function batchSaveImages(images) {
  return post('/article-image/batch', images.map(serializeGalleryImage)).then((data) =>
    Array.isArray(data) ? data.map(normalizeGalleryImage) : data
  );
}

/**
 * 更新图片信息
 */
export function updateImage(id, data) {
  return put(`/article-image/${id}`, serializeGalleryImage(data)).then(normalizeGalleryImage);
}

/**
 * 删除图片（软删除）
 */
export function deleteImage(id) {
  return del(`/article-image/${id}`);
}

/**
 * 更新图片说明文字
 */
export function updateCaption(id, caption) {
  return put(`/article-image/${id}/caption`, { caption });
}

/**
 * 调用 Agent 生成配图（分析段落 + 生成图片）
 */
export function generateImages(articleId, draftContent, style = 'health_science', maxImages = 1) {
  return agentPost('/agent/generate-images', serializeAgentImageRequest({
    articleId,
    draftContent,
    style,
    maxImages,
  })).then((result) => ({
    ...result,
    images: Array.isArray(result?.images) ? result.images.map(normalizeGalleryImage) : [],
  }));
}

export async function uploadImage(file, { articleId, caption } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (articleId) form.append('article_id', String(articleId));
  if (caption) form.append('caption', caption);

  const res = await fetch('/api/agent/upload-image', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const json = await res.json();
      message = json.detail || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return normalizeGalleryImage(await res.json());
}

export async function isImageReachable(src) {
  if (!src) return false;
  try {
    const head = await fetch(src, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return true;
    if (head.status !== 405) return false;
  } catch {
    // Fall back to GET below.
  }

  try {
    const res = await fetch(src, {
      method: 'GET',
      cache: 'no-store',
      headers: { Range: 'bytes=0-0' },
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}
