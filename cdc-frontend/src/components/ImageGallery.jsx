import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Image as ImageIcon, Loader2, Trash2, Edit3, X,
  Sparkles, AlertTriangle, ImagePlus, Check, Upload, AlignCenter, AlignLeft,
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.jsx';
import { Card, CardContent } from './ui/card.jsx';
import { Badge } from './ui/badge.jsx';
import { ScrollArea } from './ui/scroll-area.jsx';
import { Input } from './ui/input.jsx';
import * as galleryApi from '../api/gallery.js';
import { compressImageFile, extractImagePromptMeta, normalizeImageSrc, parseSectionNoFromTitle } from '../lib/content.js';

/**
 * ImageGallery - 文章配图画廊（重新设计）
 *
 * 生成按钮作为醒目主操作，无嵌套子 tab，适配 320px 右侧面板。
 *
 * Props:
 *   articleId    - 文章 ID
 *   draftContent - 当前初稿内容（用于 AI 分析段落）
 *   readonly     - 是否为只读模式（终稿阶段）
 */
function parseSectionsFromDraft(content) {
  if (!content) return [];
  const sections = [];
  const lines = content.split('\n');
  let idx = 0;
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)/);
    if (match) {
      sections.push({ index: idx, title: match[1].trim() });
      idx++;
    }
  }
  return sections;
}

/**
 * 在文章 heading 列表中查找与 sectionTitle 匹配的 heading 索引。
 * 支持精确匹配和包含匹配。
 */
function findHeadingIndex(sectionTitle, sections) {
  if (!sectionTitle || !sections?.length) return -1;
  const t = sectionTitle.trim().toLowerCase();
  // 精确匹配
  const exact = sections.findIndex((s) => s.title.trim().toLowerCase() === t);
  if (exact >= 0) return exact;
  // 包含匹配（sectionTitle 包含 heading 或 heading 包含 sectionTitle）
  return sections.findIndex(
    (s) => s.title.toLowerCase().includes(t) || t.includes(s.title.toLowerCase())
  );
}

function getImageDisplayInfo(img, draftContent) {
  const promptMeta = extractImagePromptMeta(img?.generationPrompt || img?.prompt || '');
  const rawCaption = String(img?.caption || '').trim();
  const captionLooksPrompt = rawCaption.length > 40 && (
    rawCaption.includes('段落标题') ||
    rawCaption.includes('段落内容') ||
    rawCaption.includes('为健康科普文章生成')
  );

  // 通过匹配实际文章 heading 确定段落号（最可靠）
  let sectionNo = null;
  if (promptMeta.sectionTitle && draftContent) {
    const sections = parseSectionsFromDraft(draftContent);
    const headingIdx = findHeadingIndex(promptMeta.sectionTitle, sections);
    if (headingIdx >= 0) {
      sectionNo = headingIdx + 1; // 显示为 1-based
    }
  }

  // fallback: 如果没有 draftContent 或匹配失败，用 position
  if (sectionNo == null && img?.position != null) {
    sectionNo = Number(img.position) + 1;
  }

  const title = promptMeta.sectionTitle || (!captionLooksPrompt ? rawCaption : '') || (sectionNo ? `第 ${sectionNo} 部分配图` : '配图');

  return {
    sectionNo,
    sectionTitle: promptMeta.sectionTitle,
    sectionLabel: sectionNo ? `第 ${sectionNo} 部分` : '',
    title,
    content: promptMeta.sectionContent,
    topic: promptMeta.topic,
    requirement: promptMeta.requirement,
  };
}

export default function ImageGallery({ articleId, draftContent, readonly = false, onInsertImage, onRemoveImage }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [imageStatus, setImageStatus] = useState({});
  const [error, setError] = useState(null);
  const [pendingInsert, setPendingInsert] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [selectedSection, setSelectedSection] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  /* Load images on mount */
  const loadImages = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const data = await galleryApi.listImages(articleId);
      setImages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('加载配图失败:', e);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    let cancelled = false;
    const pending = images.filter((img) => img.filePath);
    if (pending.length === 0) return undefined;

    pending.forEach((img) => {
      setImageStatus((prev) => ({ ...prev, [img.id]: prev[img.id] || 'checking' }));
    });

    async function validate() {
      const results = await Promise.all(
        pending.map(async (img) => [img.id, await galleryApi.isImageReachable(img.filePath)])
      );
      if (cancelled) return;
      setImageStatus((prev) => {
        const next = { ...prev };
        results.forEach(([id, ok]) => {
          next[id] = ok ? 'ready' : 'error';
        });
        return next;
      });
    }

    validate();
    return () => { cancelled = true; };
  }, [images]);

  const saveGeneratedImages = async (generatedImages) => {
    const validImages = [];
    const sections = parseSectionsFromDraft(draftContent);

    for (const [idx, img] of generatedImages.entries()) {
      const filePath = normalizeImageSrc(img.file_path || img.filePath || img.url || '');
      if (!filePath) continue;
      const reachable = await galleryApi.isImageReachable(filePath);
      if (!reachable) continue;

      const sectionTitle = img.section_title || img.sectionTitle || '';

      // 用 section_title 匹配实际文章 heading 确定正确 position
      let position = img.section_index ?? img.position ?? idx;
      if (sectionTitle && sections.length > 0) {
        const headingIdx = findHeadingIndex(sectionTitle, sections);
        if (headingIdx >= 0) {
          position = headingIdx;
        }
      }

      validImages.push({
        articleId: parseInt(articleId, 10),
        imageKey: img.image_key || img.imageKey || `img_${String(Date.now()).slice(-6)}_${idx + 1}`,
        filePath,
        caption: img.caption || sectionTitle || `第 ${position + 1} 部分配图`,
        position,
        generatedBy: img.generated_by || img.generatedBy || 'SenseNova-U1-Lite',
        generationPrompt: img.prompt || img.generation_prompt || '',
        width: img.width || null,
        height: img.height || null,
        fileSize: img.file_size || img.fileSize || null,
        status: 1,
      });
    }

    if (validImages.length === 0) return [];
    return galleryApi.batchSaveImages(validImages);
  };

  /* AI generate images */
  const handleGenerate = async () => {
    if (!draftContent) {
      setError('请先完成初稿内容后再生成配图');
      return;
    }
    setGenerating(true);
    setGenProgress('正在分析文章段落...');
    setError(null);
    try {
      setGenProgress('正在生成配图，预计需要 30-60 秒...');
      const result = await galleryApi.generateImages(
        articleId,
        draftContent,
        'health_science',
        1
      );

      const generatedImages = result?.images || [];
      if (generatedImages.length > 0) {
        const saved = await saveGeneratedImages(generatedImages);
        if (saved.length === 0) {
          setError('AI 返回了配图结果，但图片文件不可访问，已阻止保存坏图记录');
          setGenProgress('');
          return;
        }
        setGenProgress(`已生成 ${saved.length} 张配图`);
        await loadImages();
        // 弹出插入确认对话框
        if (saved.length > 0) {
          setPendingInsert(saved[0]);
        }
      } else {
        setGenProgress('未生成可用配图，请检查图片生成模型配置');
      }
    } catch (e) {
      console.error('生成配图失败:', e);
      setError('配图生成失败: ' + (e.message || '未知错误'));
    } finally {
      setGenerating(false);
      setTimeout(() => setGenProgress(''), 3000);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      const uploaded = await galleryApi.uploadImage(compressed, {
        articleId,
        caption: file.name.replace(/\.[^.]+$/, ''),
      });

      if (!uploaded.filePath || !(await galleryApi.isImageReachable(uploaded.filePath))) {
        throw new Error('图片已上传但无法访问，请检查 /uploads 静态资源服务');
      }

      const savedImage = {
        articleId: parseInt(articleId, 10),
        imageKey: `upload_${Date.now()}`,
        filePath: uploaded.filePath,
        caption: uploaded.caption || file.name,
        position: images.length,
        generatedBy: 'manual_upload',
        generationPrompt: '',
        width: uploaded.width || null,
        height: uploaded.height || null,
        fileSize: uploaded.fileSize || compressed.size,
        status: 1,
      };
      const dbImage = await galleryApi.saveImage(savedImage);

      // 解析段落并弹出插入确认对话框
      const sections = parseSectionsFromDraft(draftContent);
      const uploadInfo = {
        ...savedImage,
        id: dbImage?.id || `upload_${Date.now()}`,
        sections,
      };
      setPendingUpload(uploadInfo);
      setSelectedSection(Math.min(sections.length, 1));
      await loadImages();
    } catch (e) {
      console.error('上传图片失败:', e);
      setError('上传图片失败: ' + (e.message || '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  /* Delete image */
  const handleDelete = async (imageId) => {
    const img = images.find(i => i.id === imageId);
    try {
      await galleryApi.deleteImage(imageId);
      setImages(prev => prev.filter(i => i.id !== imageId));
      setDeletingId(null);
      // 同步清除草稿中已插入的图片
      if (img && onRemoveImage) {
        onRemoveImage(img);
      }
    } catch (e) {
      console.error('删除图片失败:', e);
    }
  };

  /* Start editing caption */
  const startEditCaption = (img) => {
    setEditingId(img.id);
    setEditCaption(img.caption || '');
  };

  /* Save caption */
  const saveCaption = async (imageId) => {
    try {
      await galleryApi.updateCaption(imageId, editCaption);
      setImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, caption: editCaption } : img
      ));
      setEditingId(null);
    } catch (e) {
      console.error('更新说明失败:', e);
    }
  };

  /* Confirm insert from dialog */
  const confirmInsert = useCallback(() => {
    if (pendingInsert && onInsertImage) {
      onInsertImage(pendingInsert, { align: 'center', width: 720, insertAt: 'section' });
    }
    setPendingInsert(null);
  }, [pendingInsert, onInsertImage]);

  /* Confirm upload insert from section selection dialog */
  const confirmUploadInsert = useCallback(async () => {
    if (!pendingUpload) return;
    const sections = pendingUpload.sections || [];
    const totalSections = sections.length;

    let sectionTitle = '';
    let position = 0;
    let insertAt = 'section';

    if (selectedSection === 0) {
      // 文章开头 — 直接在最前方插入
      sectionTitle = '';
      position = 0;
      insertAt = 'prepend';
    } else if (selectedSection > totalSections) {
      // 文章末尾 — 无匹配则 fallback 到末尾
      sectionTitle = '';
      position = totalSections;
    } else {
      // 具体段落
      const chosen = sections[selectedSection - 1];
      sectionTitle = chosen?.title || '';
      position = chosen?.index ?? selectedSection - 1;
    }

    const imgForInsert = {
      ...pendingUpload,
      position,
      generationPrompt: sectionTitle ? `段落标题: ${sectionTitle}` : '',
    };

    // 将用户选择的段落信息持久化到 DB（position + generationPrompt）
    const dbId = pendingUpload.id;
    if (dbId && typeof dbId === 'number') {
      try {
        await galleryApi.updateImage(dbId, imgForInsert);
      } catch (e) {
        console.warn('更新上传图片段落信息失败:', e);
      }
    }

    if (onInsertImage) {
      onInsertImage(imgForInsert, { align: 'center', width: 720, insertAt });
    }
    setPendingUpload(null);
    await loadImages(); // 刷新以更新 badge 显示
  }, [pendingUpload, selectedSection, onInsertImage, loadImages]);

  /* ===== Render ===== */
  const hasImages = images.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-3 p-4">

          {/* ---- 醒目的生成按钮区域 ---- */}
          {!readonly && (
            <div className="enter">
              {generating ? (
                /* 生成中状态 */
                <Card className="bg-primary/5 border-primary/15">
                  <CardContent className="flex flex-col items-center gap-2.5 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Sparkles size={18} className="animate-pulse text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-medium text-foreground">{genProgress}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        AI 正在分析文章结构并生成健康科普风格配图
                      </p>
                    </div>
                    <Loader2 size={16} className="animate-spin text-primary mt-1" />
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-3",
                      "text-[13px] font-medium transition-all duration-200",
                      "border border-dashed",
                      draftContent
                        ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 active:scale-[0.98]"
                        : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                    )}
                    onClick={handleGenerate}
                    disabled={!draftContent}
                    title={!draftContent ? '请先完成初稿' : 'AI 分析段落并生成配图'}
                  >
                    <Sparkles size={15} />
                    <span>{hasImages ? '继续生成' : 'AI 生成'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3",
                      "text-[13px] font-medium transition-all duration-200",
                      uploading
                        ? "border-primary/20 bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:bg-accent"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="上传本地图片并保存到配图库"
                  >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    <span>{uploading ? '上传中' : '上传图片'}</span>
                  </button>
                </div>
              )}

              {/* 提示文字 */}
              {!generating && (
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  {!draftContent
                    ? '完成初稿后可生成 AI 配图'
                    : hasImages
                      ? '将分析新增段落继续生成配图'
                      : '自动分析段落结构，生成健康科普风格配图'}
                </p>
              )}
            </div>
          )}

          {/* ---- 错误提示 ---- */}
          {error && (
            <Card className="bg-destructive/5 border-destructive/10 enter">
              <CardContent className="flex items-center gap-3 p-3">
                <AlertTriangle size={14} className="text-destructive shrink-0" />
                <p className="text-[12px] text-destructive flex-1">{error}</p>
                <Button variant="ghost" size="sm" className="h-auto p-1 ml-auto" onClick={() => setError(null)}>
                  <X size={12} />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ---- 加载中 ---- */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {/* ---- 图片网格 ---- */}
          {!loading && hasImages && (
            <>
              {/* 数量标识 */}
              <div className="flex items-center gap-2">
                <ImageIcon size={13} className="text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  已生成 {images.length} 张配图
                </span>
              </div>

              {/* 列表：单列 */}
              <div className="flex flex-col gap-3">
                {images.map((img, idx) => {
                  const status = imageStatus[img.id] || (img.filePath ? 'checking' : 'error');
                  const canUseImage = Boolean(img.filePath) && status !== 'error';
                  const info = getImageDisplayInfo(img, draftContent);
                  const isDeleting = deletingId === img.id;
                  const placeholderText = !img.filePath
                    ? '无图片路径'
                    : status === 'checking'
                      ? '校验图片...'
                      : '图片加载失败';

                  return (
                  <Card
                    key={img.id}
                    className="group bg-card border border-border overflow-hidden enter-scale hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300"
                    style={{ '--enter-delay': `${idx * 50}ms` }}
                  >
                    {/* Image - click to enlarge */}
                    <div
                      className="relative w-full bg-muted/50 overflow-hidden cursor-pointer"
                      onClick={() => canUseImage && setPreviewImage(img)}
                    >
                      {canUseImage ? (
                        <img
                          src={img.filePath}
                          alt={img.caption || '配图'}
                          className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
                          onLoad={() => setImageStatus((prev) => ({ ...prev, [img.id]: 'ready' }))}
                          onError={() => setImageStatus((prev) => ({ ...prev, [img.id]: 'error' }))}
                        />
                      ) : null}
                      {/* Fallback placeholder */}
                      <div
                        className={cn(
                          "flex flex-col items-center justify-center text-muted-foreground/40 py-12",
                          canUseImage ? 'hidden' : 'flex'
                        )}
                      >
                        {status === 'checking' ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={24} />}
                        <span className="text-[10px] mt-1">{placeholderText}</span>
                      </div>

                      {/* Hover overlay - edit button only */}
                      <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-200 opacity-0 group-hover:opacity-100">
                        {!readonly && (
                          <button
                            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 hover:bg-background text-foreground transition-colors shadow-sm"
                            onClick={(e) => { e.stopPropagation(); startEditCaption(img); }}
                            title="编辑说明"
                          >
                            <Edit3 size={12} />
                          </button>
                        )}
                      </div>

                      {/* Section badge */}
                      {info.sectionNo != null && (
                        <div className="absolute bottom-2 left-2">
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-background/85 backdrop-blur-sm shadow-sm">
                            {info.sectionLabel}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Bottom bar */}
                    <div className="px-3 pb-2.5 pt-2">
                      {editingId === img.id ? (
                        /* Caption editing mode */
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editCaption}
                            onChange={(e) => setEditCaption(e.target.value)}
                            className="h-7 text-[12px] px-2 flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCaption(img.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                            onClick={() => saveCaption(img.id)}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setEditingId(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        /* Delete confirmation mode */
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="text-[12px] text-destructive font-medium">确定删除这张配图？</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="px-3 py-1 rounded-md text-[11px] font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
                              onClick={() => handleDelete(img.id)}
                            >
                              删除
                            </button>
                            <button
                              className="px-3 py-1 rounded-md text-[11px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              onClick={() => setDeletingId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : !readonly && onInsertImage ? (
                        /* Normal mode: insert buttons + delete */
                        <div className="flex items-center gap-2">
                          <button
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium py-2 transition-colors",
                              canUseImage
                                ? "bg-primary/8 hover:bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                            )}
                            onClick={() => canUseImage && onInsertImage(img, { align: 'center', width: 720, insertAt: 'section' })}
                            disabled={!canUseImage}
                            title="居中插入对应段落"
                          >
                            <AlignCenter size={13} />
                            居中插入
                          </button>
                          <button
                            className={cn(
                              "flex flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium py-2 transition-colors",
                              canUseImage
                                ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                                : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                            )}
                            onClick={() => canUseImage && onInsertImage(img, { align: 'left', width: 520, insertAt: 'section' })}
                            disabled={!canUseImage}
                            title="左对齐插入对应段落"
                          >
                            <AlignLeft size={13} />
                            左对齐
                          </button>
                          <button
                            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-colors"
                            onClick={() => setDeletingId(img.id)}
                            title="删除配图"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* ---- 空状态（仅 readonly 模式，非 readonly 已有生成按钮） ---- */}
          {!loading && !hasImages && !generating && readonly && (
            <div className="py-10 text-center text-muted-foreground enter">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-3">
                <ImageIcon size={20} className="text-muted-foreground/40" />
              </div>
              <p className="text-[13px] font-medium">暂无配图</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Insert confirmation dialog */}
      {pendingInsert && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
            onClick={() => setPendingInsert(null)}
          />
          <div className="relative z-10 w-[320px] rounded-xl bg-card border border-border shadow-2xl overflow-hidden">
            {/* Image preview */}
            {pendingInsert.filePath && (
              <div className="w-full bg-muted/30">
                <img
                  src={pendingInsert.filePath}
                  alt={pendingInsert.caption || '配图'}
                  className="w-full h-auto object-contain"
                />
              </div>
            )}
            {/* Info */}
            <div className="p-4">
              <p className="text-[13px] font-medium text-foreground">
                配图已生成
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                将插入到 <span className="font-medium text-primary">{(() => {
                  const info = getImageDisplayInfo(pendingInsert, draftContent);
                  return info.sectionTitle || info.title || info.sectionLabel;
                })()}</span> 段落后方
              </p>
              {(() => {
                const info = getImageDisplayInfo(pendingInsert, draftContent);
                return info.content ? (
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-2">
                    {info.content}
                  </p>
                ) : null;
              })()}
              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[12px]"
                  onClick={() => setPendingInsert(null)}
                >
                  稍后手动插入
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-[12px]"
                  onClick={confirmInsert}
                >
                  确认插入（居中）
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Upload section selection dialog */}
      {pendingUpload && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
            onClick={() => setPendingUpload(null)}
          />
          <div className="relative z-10 w-[320px] rounded-xl bg-card border border-border shadow-2xl overflow-hidden">
            {/* Image preview */}
            {pendingUpload.filePath && (
              <div className="w-full bg-muted/30 max-h-[200px] overflow-hidden">
                <img
                  src={pendingUpload.filePath}
                  alt={pendingUpload.caption || '上传图片'}
                  className="w-full h-auto object-contain"
                />
              </div>
            )}
            {/* Section selection */}
            <div className="p-4">
              <p className="text-[13px] font-medium text-foreground">
                图片已上传
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                请选择要插入到的段落位置
              </p>
              <select
                className="w-full mt-3 rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={selectedSection}
                onChange={(e) => setSelectedSection(Number(e.target.value))}
              >
                <option value={0}>文章开头（标题前方）</option>
                {(pendingUpload.sections || []).map((s) => (
                  <option key={s.index} value={s.index + 1}>
                    {s.title}
                  </option>
                ))}
                <option value={(pendingUpload.sections || []).length + 1}>文章末尾</option>
              </select>
              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[12px]"
                  onClick={() => setPendingUpload(null)}
                >
                  稍后手动插入
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-[12px]"
                  onClick={confirmUploadInsert}
                >
                  确认插入（居中）
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox preview dialog - portal to body for full-screen overlay */}
      {previewImage && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-foreground/70 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          />
          <div className="relative z-10 flex flex-col items-center max-w-[80vw] max-h-[85vh]">
            {/* Close button */}
            <button
              className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-background/20 hover:bg-background/40 text-white transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X size={18} />
            </button>

            {/* Image */}
            {previewImage.filePath && (
              <img
                src={previewImage.filePath}
                alt={previewImage.caption || '配图'}
                className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
