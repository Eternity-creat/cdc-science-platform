import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Image as ImageIcon, Loader2, Trash2, Edit3, X,
  Sparkles, AlertTriangle, ImagePlus, Check
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.jsx';
import { Card, CardContent } from './ui/card.jsx';
import { Badge } from './ui/badge.jsx';
import { ScrollArea } from './ui/scroll-area.jsx';
import { Input } from './ui/input.jsx';
import * as galleryApi from '../api/gallery.js';

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
export default function ImageGallery({ articleId, draftContent, readonly = false, onInsertImage }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [error, setError] = useState(null);

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
        const toSave = generatedImages.map((img, idx) => ({
          articleId: parseInt(articleId),
          imageKey: `img_${String(Date.now()).slice(-6)}_${idx + 1}`,
          filePath: img.file_path || img.url || '',
          caption: img.caption || img.prompt || `段落配图 ${idx + 1}`,
          position: img.section_index ?? idx,
          generatedBy: 'SenseNova-U1-Lite',
          generationPrompt: img.prompt || '',
          width: img.width || null,
          height: img.height || null,
          fileSize: img.file_size || null,
          status: 1,
        }));

        await galleryApi.batchSaveImages(toSave);
        setGenProgress(`已生成 ${generatedImages.length} 张配图`);
        await loadImages();
      } else {
        setGenProgress('未识别到需要配图的段落');
      }
    } catch (e) {
      console.error('生成配图失败:', e);
      setError('配图生成失败: ' + (e.message || '未知错误'));
    } finally {
      setGenerating(false);
      setTimeout(() => setGenProgress(''), 3000);
    }
  };

  /* Delete image */
  const handleDelete = async (imageId) => {
    try {
      await galleryApi.deleteImage(imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
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
                /* 主操作按钮 */
                <button
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3",
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
                  {hasImages ? '继续生成配图' : 'AI 生成配图'}
                </button>
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

              {/* 网格 */}
              <div className="grid grid-cols-2 gap-2.5">
                {images.map((img, idx) => (
                  <Card
                    key={img.id}
                    className="group bg-card border border-border overflow-hidden enter-scale hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300"
                    style={{ '--enter-delay': `${idx * 50}ms` }}
                  >
                    {/* Image thumbnail - click to enlarge */}
                    <div
                      className="relative aspect-[4/3] bg-muted/50 overflow-hidden cursor-pointer"
                      onClick={() => setPreviewImage(img)}
                    >
                      {img.filePath ? (
                        <img
                          src={img.filePath}
                          alt={img.caption || '配图'}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      {/* Fallback placeholder */}
                      <div
                        className={cn(
                          "absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40",
                          img.filePath ? 'hidden' : 'flex'
                        )}
                        style={!img.filePath ? {} : { display: 'none' }}
                      >
                        <ImagePlus size={24} />
                        <span className="text-[10px] mt-1">图片加载失败</span>
                      </div>

                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors duration-200 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                        {!readonly && (
                          <>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-background/80 hover:bg-background text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); startEditCaption(img); }}
                              title="编辑说明"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/80 hover:bg-destructive text-white transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                              title="删除"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Position badge */}
                      {img.position != null && (
                        <div className="absolute top-1.5 left-1.5">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-background/70 backdrop-blur-sm">
                            P{img.position + 1}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Caption */}
                    <div className="p-2">
                      {editingId === img.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editCaption}
                            onChange={(e) => setEditCaption(e.target.value)}
                            className="h-6 text-[11px] px-1.5"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCaption(img.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            className="shrink-0 text-primary"
                            onClick={() => saveCaption(img.id)}
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 min-h-[2.2em]">
                          {img.caption || '暂无说明'}
                        </p>
                      )}
                      {img.generatedBy && (
                        <p className="text-[9px] text-muted-foreground/50 mt-1 truncate">
                          {img.generatedBy}
                        </p>
                      )}
                    </div>

                    {/* Insert button (non-readonly only) */}
                    {!readonly && onInsertImage && (
                      <div className="px-2 pb-2">
                        <button
                          className="w-full flex items-center justify-center gap-1 rounded-md bg-primary/8 hover:bg-primary/15 text-primary text-[11px] font-medium py-1.5 transition-colors"
                          onClick={() => onInsertImage(img)}
                        >
                          <ImagePlus size={12} />
                          插入文章
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
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
