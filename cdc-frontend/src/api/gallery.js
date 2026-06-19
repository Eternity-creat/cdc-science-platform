import { get, post, put, del } from './index.js';

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
  return get(`/article-image/article/${articleId}`);
}

/**
 * 获取单张图片详情
 */
export function getImage(id) {
  return get(`/article-image/${id}`);
}

/**
 * 保存单张图片
 */
export function saveImage(data) {
  return post('/article-image', data);
}

/**
 * 批量保存图片
 */
export function batchSaveImages(images) {
  return post('/article-image/batch', images);
}

/**
 * 更新图片信息
 */
export function updateImage(id, data) {
  return put(`/article-image/${id}`, data);
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
  return put(`/article-image/${id}/caption?caption=${encodeURIComponent(caption)}`, {});
}

/**
 * 调用 Agent 生成配图（分析段落 + 生成图片）
 */
export function generateImages(articleId, draftContent, style = 'health_science', maxImages = 1) {
  return agentPost('/agent/generate-images', {
    article_id: articleId ? parseInt(articleId) : null,
    draft_content: draftContent,
    style,
    max_images: maxImages,
  });
}
