import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Save, Wand2, FileCheck2, Clock,
  ArrowLeft, Download, Eye, Loader2, Sparkles, CheckCircle2,
  RefreshCw, RotateCcw, AlertTriangle, X
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Textarea } from '../components/ui/textarea.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import { ScrollArea } from '../components/ui/scroll-area.jsx';
import Pipeline from '../components/Pipeline.jsx';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';
import ImageGallery from '../components/ImageGallery.jsx';
import * as articleApi from '../api/article.js';

/* ===== Status Map (aligned with backend 1-5) ===== */
const STATUS_MAP = {
  1: { label: '待生成大纲', variant: 'secondary' },
  2: { label: '大纲编辑中', variant: 'default' },
  3: { label: '初稿编辑中', variant: 'warning' },
  4: { label: '终稿已确认', variant: 'success' },
  5: { label: '已发布', variant: 'success' },
};

const OPERATION_LABELS = {
  manual_edit: '手动编辑',
  ai_generate: 'AI 生成',
  ai_regenerate: 'AI 重新生成',
  revert: '版本回退',
};

function getStatusInfo(status) {
  return STATUS_MAP[status] || { label: '未知', variant: 'secondary' };
}

/* ===== Helpers ===== */

function parseOutlineToTree(outlineStr) {
  if (!outlineStr) return [];
  const lines = outlineStr.split('\n');
  const items = [];
  let counter = 0;
  let lastH1Id = null;

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      const id = `h2-${++counter}`;
      items.push({ id, level: 2, title: line.slice(3).trim(), parentId: lastH1Id });
    } else if (line.startsWith('# ')) {
      const id = `h1-${++counter}`;
      lastH1Id = id;
      items.push({ id, level: 1, title: line.slice(2).trim(), expanded: true });
    }
  });
  return items;
}

function parseTraceToSteps(traceList) {
  if (!traceList || traceList.length === 0) return [];
  return traceList.map((t, i) => ({
    id: i + 1,
    name: t.stepName || `步骤${i + 1}`,
    status: 'success',
    costTime: t.costTime || null,
  }));
}

function parseModifications(modList) {
  if (!modList) return [];
  return modList.map((m) => ({
    id: m.id,
    type: m.modifyType || 'outline',
    operationType: m.operationType || 'manual_edit',
    time: m.modifyTime ? m.modifyTime.replace('T', ' ').slice(0, 19) : '',
    before: m.beforeContent ? m.beforeContent.slice(0, 80) : '',
    after: m.afterContent ? m.afterContent.slice(0, 80) : '',
  }));
}

/* ===== Outline Tree Item ===== */

function OutlineTreeItem({ item, expanded, toggle, onClick, activeId, index = 0 }) {
  const isH1 = item.level === 1;
  const parentExpanded = expanded[item.parentId] !== false;
  if (item.level === 2 && !parentExpanded) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1 cursor-pointer rounded-[var(--radius-sm)] transition-all duration-200 ease-out enter',
        'hover:bg-accent hover:translate-x-0.5 active:scale-[0.98]',
        isH1 ? 'px-3 py-1.5' : 'py-1 pl-7 pr-3',
        activeId === item.id && 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]'
      )}
      style={{ '--enter-delay': `${index * 30}ms` }}
      onClick={() => {
        if (isH1) toggle(item);
        onClick?.(item);
      }}
    >
      {isH1 && (
        <span className="mr-0.5 text-muted-foreground transition-transform duration-200">
          {expanded[item.id] !== false ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      )}
      {!isH1 && <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />}
      <span className={cn(
        'truncate transition-colors duration-200',
        isH1 ? 'ml-0 text-[13px] font-medium text-foreground' : 'ml-1.5 text-xs text-muted-foreground',
        activeId === item.id && 'text-primary font-semibold'
      )}>
        {item.title}
      </span>
    </div>
  );
}

/* ===== Confirm Dialog ===== */

function ConfirmDialog({ open, title, message, onConfirm, onCancel, loading, confirmText, variant }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onCancel} />
      <Card className="relative z-10 w-full max-w-sm shadow-[var(--shadow-modal)]">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h3 className="text-body font-semibold">{title}</h3>
          </div>
          <p className="text-helper text-muted-foreground mb-5">{message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
            <Button
              variant={variant || 'default'}
              size="sm"
              onClick={onConfirm}
              disabled={loading}
              className="gap-1.5"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmText || '确认'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ===== Main Component ===== */

export default function Workbench() {
  const { id } = useParams();
  const navigate = useNavigate();

  /* Data */
  const [article, setArticle] = useState(null);
  const [outline, setOutline] = useState('');
  const [editOutline, setEditOutline] = useState('');
  const [outlineItems, setOutlineItems] = useState([]);
  const [draftText, setDraftText] = useState('');
  const [editDraft, setEditDraft] = useState('');
  const [finalText, setFinalText] = useState('');
  const [pipelineSteps, setPipelineSteps] = useState([]);
  const [modifications, setModifications] = useState([]);
  const [context, setContext] = useState(null);

  /* UI state */
  const [rightTab, setRightTab] = useState('trace');
  const [outlineExpanded, setOutlineExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState('');
  const [autoSavedAt, setAutoSavedAt] = useState(null);
  const [editorTab, setEditorTab] = useState('draft');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  /* Refs for auto-save */
  const autoSaveTimer = useRef(null);
  const lastAutoSaveField = useRef(null);
  const draftTextareaRef = useRef(null);

  /* Determine phase from article status */
  const phase = (() => {
    if (!article) return 'outline';
    if (article.status <= 2) return 'outline';
    if (article.status === 3) return 'draft';
    return 'final'; // 4 or 5
  })();

  /* ===== Load article on mount ===== */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const art = await articleApi.getArticle(id);
        if (cancelled) return;
        setArticle(art);

        if (art.outline) {
          setOutline(art.outline);
          setEditOutline(art.outline);
          setOutlineItems(parseOutlineToTree(art.outline));
        }
        if (art.initialDraft) {
          setDraftText(art.initialDraft);
          setEditDraft(art.initialDraft);
        }
        if (art.finalArticle) {
          setFinalText(art.finalArticle);
        }
      } catch (e) {
        console.error('加载文章失败:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  /* ===== Load extras (trace, mods, context) when entering draft/final ===== */
  useEffect(() => {
    if (phase === 'outline') return;
    let cancelled = false;
    async function loadExtras() {
      try {
        const [traces, mods, ctx] = await Promise.all([
          articleApi.getTrace(id).catch(() => []),
          articleApi.getModifications(id).catch(() => []),
          articleApi.getArticleContext(id).catch(() => null),
        ]);
        if (cancelled) return;
        setPipelineSteps(parseTraceToSteps(traces));
        setModifications(parseModifications(mods));
        setContext(ctx);
      } catch (e) {
        console.error('加载辅助数据失败:', e);
      }
    }
    loadExtras();
    return () => { cancelled = true; };
  }, [id, phase]);

  /* ===== Ensure outlineItems stays in sync when outline changes ===== */
  useEffect(() => {
    if (outline && outlineItems.length === 0) {
      setOutlineItems(parseOutlineToTree(outline));
    }
  }, [outline, outlineItems.length]);

  /* ===== Auto-save ===== */
  const scheduleAutoSave = useCallback((field, content) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await articleApi.autoSave(id, field, content);
        setAutoSavedAt(new Date());
      } catch (e) {
        console.error('自动保存失败:', e);
      }
    }, 3000);
  }, [id]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  /* ===== Action handlers ===== */

  const handleGenerateOutline = async () => {
    setGenerating(true);
    setGeneratingLabel('正在生成大纲');
    try {
      const result = await articleApi.generateOutline(id);
      if (result) {
        setOutline(result);
        setEditOutline(result);
        setOutlineItems(parseOutlineToTree(result));
        setArticle(prev => prev ? { ...prev, status: 2, outline: result } : prev);
        // Reload extras
        const [traces, mods] = await Promise.all([
          articleApi.getTrace(id).catch(() => []),
          articleApi.getModifications(id).catch(() => []),
        ]);
        setPipelineSteps(parseTraceToSteps(traces));
        setModifications(parseModifications(mods));
      }
    } catch (e) {
      console.error('生成大纲失败:', e);
    } finally {
      setGenerating(false);
      setGeneratingLabel('');
    }
  };

  const handleRegenerateOutline = () => {
    setConfirmDialog({
      title: '重新生成大纲',
      message: '重新生成将覆盖当前大纲内容，当前版本已保存至修改历史。是否继续？',
      confirmText: '重新生成',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmDialog(null);
        setGenerating(true);
        setGeneratingLabel('正在重新生成大纲');
        try {
          const result = await articleApi.regenerateOutline(id);
          if (result) {
            setOutline(result);
            setEditOutline(result);
            setOutlineItems(parseOutlineToTree(result));
            const [traces, mods] = await Promise.all([
              articleApi.getTrace(id).catch(() => []),
              articleApi.getModifications(id).catch(() => []),
            ]);
            setPipelineSteps(parseTraceToSteps(traces));
            setModifications(parseModifications(mods));
          }
        } catch (e) {
          console.error('重新生成大纲失败:', e);
        } finally {
          setGenerating(false);
          setGeneratingLabel('');
        }
      },
    });
  };

  const handleSaveOutline = async () => {
    setSaving(true);
    try {
      await articleApi.saveOutline(id, editOutline);
      setOutline(editOutline);
      setOutlineItems(parseOutlineToTree(editOutline));
      const mods = await articleApi.getModifications(id).catch(() => []);
      setModifications(parseModifications(mods));
    } catch (e) {
      console.error('保存大纲失败:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOutlineAndGenerateDraft = async () => {
    // First save outline if changed
    if (editOutline !== outline) {
      await articleApi.confirmOutline(id, editOutline);
      setOutline(editOutline);
      setOutlineItems(parseOutlineToTree(editOutline));
    }
    // Then generate draft
    setGenerating(true);
    setGeneratingLabel('正在生成初稿');
    try {
      const result = await articleApi.generateDraft(id);
      if (result) {
        setDraftText(result);
        setEditDraft(result);
        setArticle(prev => prev ? { ...prev, status: 3, initialDraft: result } : prev);
        const [traces, mods, ctx] = await Promise.all([
          articleApi.getTrace(id).catch(() => []),
          articleApi.getModifications(id).catch(() => []),
          articleApi.getArticleContext(id).catch(() => null),
        ]);
        setPipelineSteps(parseTraceToSteps(traces));
        setModifications(parseModifications(mods));
        setContext(ctx);
      }
    } catch (e) {
      console.error('生成初稿失败:', e);
    } finally {
      setGenerating(false);
      setGeneratingLabel('');
    }
  };

  const handleRegenerateDraft = () => {
    setConfirmDialog({
      title: '重新生成初稿',
      message: '重新生成将覆盖当前初稿内容，当前版本已保存至修改历史。是否继续？',
      confirmText: '重新生成',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmDialog(null);
        setGenerating(true);
        setGeneratingLabel('正在重新生成初稿');
        try {
          const result = await articleApi.regenerateDraft(id);
          if (result) {
            setDraftText(result);
            setEditDraft(result);
            const [traces, mods] = await Promise.all([
              articleApi.getTrace(id).catch(() => []),
              articleApi.getModifications(id).catch(() => []),
            ]);
            setPipelineSteps(parseTraceToSteps(traces));
            setModifications(parseModifications(mods));
          }
        } catch (e) {
          console.error('重新生成初稿失败:', e);
        } finally {
          setGenerating(false);
          setGeneratingLabel('');
        }
      },
    });
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await articleApi.saveDraft(id, editDraft);
      setDraftText(editDraft);
      const mods = await articleApi.getModifications(id).catch(() => []);
      setModifications(parseModifications(mods));
    } catch (e) {
      console.error('保存初稿失败:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = async () => {
    // Save draft if changed
    if (editDraft !== draftText) {
      await articleApi.saveDraft(id, editDraft);
      setDraftText(editDraft);
    }
    try {
      await articleApi.confirmDraft(id);
      // Refresh to get final article
      const art = await articleApi.getArticle(id);
      if (art) {
        setArticle(art);
        if (art.finalArticle) setFinalText(art.finalArticle);
        else if (art.initialDraft) setFinalText(art.initialDraft);
        if (art.initialDraft) {
          setDraftText(art.initialDraft);
          setEditDraft(art.initialDraft);
        }
      }
    } catch (e) {
      console.error('确认终稿失败:', e);
    }
  };

  const handleRevert = async (modificationId) => {
    setConfirmDialog({
      title: '回退版本',
      message: '将恢复到该修改记录之前的内容版本，当前内容也会被保存为新的修改记录。是否继续？',
      confirmText: '回退',
      variant: 'default',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await articleApi.revertToModification(id, modificationId);
          // Reload article
          const art = await articleApi.getArticle(id);
          if (art) {
            setArticle(art);
            if (art.outline) {
              setOutline(art.outline);
              setEditOutline(art.outline);
              setOutlineItems(parseOutlineToTree(art.outline));
            }
            if (art.initialDraft) {
              setDraftText(art.initialDraft);
              setEditDraft(art.initialDraft);
            }
            if (art.finalArticle) setFinalText(art.finalArticle);
          }
          const mods = await articleApi.getModifications(id).catch(() => []);
          setModifications(parseModifications(mods));
        } catch (e) {
          console.error('回退失败:', e);
        }
      },
    });
  };

  const toggleOutline = useCallback((item) => {
    if (item.level === 1) {
      setOutlineExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }));
    }
  }, []);

  /* ===== Insert image into draft ===== */
  const insertImageToDraft = useCallback((img) => {
    if (!img?.filePath) return;
    const markdown = `\n\n![${img.caption || '配图'}](${img.filePath})\n\n`;
    const textarea = draftTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? editDraft.length;
      const before = editDraft.slice(0, start);
      const after = editDraft.slice(start);
      const newContent = before + markdown + after;
      setEditDraft(newContent);
      scheduleAutoSave('initial_draft', newContent);
    } else {
      const newContent = editDraft + markdown;
      setEditDraft(newContent);
      scheduleAutoSave('initial_draft', newContent);
    }
  }, [editDraft, scheduleAutoSave]);

  /* ===== Export Markdown ===== */
  const handleExportMarkdown = useCallback(() => {
    const content = finalText || draftText;
    if (!content) return;
    // 清理：处理字面量 \n（后端可能返回转义换行）、引用标记、多余引号
    const cleaned = content
      .split('\n')
      .map(line => line.replace(/\\n/g, '\n'))
      .join('\n')
      .replace(/\{ref:\d+\}/g, '')
      .replace(/^\s*[""'「『【]\s*(?=#)/gm, '')
      .replace(/[""'」』】"]\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const title = article?.title || '文章';
    const blob = new Blob([cleaned], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [finalText, draftText, article]);

  const statusInfo = article ? getStatusInfo(article.status) : { label: '加载中', variant: 'secondary' };
  const isReadonly = article?.status >= 4;

  /* ===== Auto-save text formatting ===== */
  const autoSaveHint = autoSavedAt
    ? `已自动保存 ${autoSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : '';

  /* ===== Loading ===== */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">加载文章中...</p>
        </div>
      </div>
    );
  }

  /* ===== Generating overlay ===== */
  if (generating) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-[400px] border-0 shadow-none text-center">
          <CardContent className="flex flex-col items-center pt-10 pb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-5">
              <Sparkles size={24} className="animate-pulse text-primary" />
            </div>
            <h2 className="text-section-title font-semibold mb-2">{generatingLabel || 'AI 生成中'}</h2>
            <p className="text-helper text-muted-foreground leading-relaxed mb-5">
              AI 正在根据知识库上下文生成内容，包含知识片段引用和规则检查，预计需要 10-60 秒...
            </p>
            <Loader2 size={18} className="animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  /* =================================================================== */
  /* ===== PHASE: OUTLINE (status 1-2) ===== */
  /* =================================================================== */
  if (phase === 'outline') {
    const hasOutline = !!outline;
    return (
      <div className="flex h-screen flex-col">
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />

        {/* Top Bar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground " onClick={() => navigate('/articles')}>
              <ArrowLeft size={14} /> 返回
            </Button>
            <span className="text-[13px] text-muted-foreground/60">/</span>
            <span className="text-sm font-medium text-foreground">文章大纲</span>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {!hasOutline ? (
              <Button size="sm" className="gap-1.5 " onClick={handleGenerateOutline}>
                <Wand2 size={14} /> AI 生成大纲
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 " onClick={handleRegenerateOutline}>
                  <RefreshCw size={14} /> 重新生成
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleSaveOutline} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
                </Button>
                <Button size="sm" className="gap-1.5 " onClick={handleConfirmOutlineAndGenerateDraft}>
                  <Sparkles size={14} /> 确认大纲并生成初稿
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Sub header */}
        <div className="border-b px-5 py-2.5 flex items-center justify-between enter" style={{ '--enter-delay': '60ms' }}>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">大纲结构</span>
          <div className="flex items-center gap-3">
            {autoSaveHint && <span className="text-[11px] text-muted-foreground">{autoSaveHint}</span>}
            <span className="text-[11px] text-muted-foreground">
              {hasOutline ? '编辑大纲后点击「确认大纲并生成初稿」' : '点击「AI 生成大纲」开始'}
            </span>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden enter" style={{ '--enter-delay': '120ms' }}>
          {/* Left: outline tree */}
          <div className="w-[280px] shrink-0 border-r">
            <ScrollArea className="h-full py-2">
              {outlineItems.length > 0 ? outlineItems.map((item, idx) => (
                <OutlineTreeItem key={item.id} item={item} expanded={outlineExpanded} toggle={toggleOutline} index={idx} />
              )) : (
                <div className="px-5 py-10 text-center text-muted-foreground">
                  <Wand2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-[13px] font-medium">暂无大纲</p>
                  <p className="mt-1 text-xs">点击上方「AI 生成大纲」开始</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right: Markdown editor + preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Tabs defaultValue="edit" className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-1 border-b px-4">
                <TabsList className="h-auto bg-transparent p-0">
                  <TabsTrigger value="edit" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    Markdown 编辑
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    预览
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="edit" className="flex-1 overflow-hidden mt-0">
                <Textarea
                  value={editOutline}
                  onChange={(e) => {
                    setEditOutline(e.target.value);
                    setOutlineItems(parseOutlineToTree(e.target.value));
                    scheduleAutoSave('outline', e.target.value);
                  }}
                  placeholder={"# 第一章节标题\n## 1.1 小节\n## 1.2 小节\n# 第二章节标题\n..."}
                  className="h-full border-0 rounded-none resize-none font-mono text-[13px] leading-relaxed px-6 py-5 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full">
                  <div className="px-8 py-6">
                    {editOutline ? (
                      <MarkdownRenderer content={editOutline} mode="outline" />
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无大纲内容</p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  }

  /* =================================================================== */
  /* ===== PHASE: DRAFT EDITOR (status 3) ===== */
  /* =================================================================== */
  if (phase === 'draft') {
    return (
      <div className="flex h-screen flex-col">
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />

        {/* Top Bar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground " onClick={() => navigate('/articles')}>
              <ArrowLeft size={14} /> 返回
            </Button>
            <span className="text-[13px] text-muted-foreground/60">/</span>
            <span className="text-sm font-medium text-foreground">文章初稿</span>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 " onClick={handleRegenerateDraft}>
              <RefreshCw size={14} /> 重新生成初稿
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleSaveDraft} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
            </Button>
            <Button size="sm" className="gap-1.5 " onClick={handleConfirmDraft}>
              <FileCheck2 size={14} /> 确认终稿
            </Button>
          </div>
        </div>

        {/* Pipeline strip */}
        {pipelineSteps.length > 0 && (
          <div className="shrink-0 border-b bg-muted/30 px-5 py-2 enter" style={{ '--enter-delay': '80ms' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent 工作流</span>
              <span className="text-[11px] text-muted-foreground">共 {pipelineSteps.length} 步</span>
            </div>
            <Pipeline steps={pipelineSteps} compact />
          </div>
        )}

        {/* Sub header */}
        <div className="border-b px-5 py-2 flex items-center justify-between enter" style={{ '--enter-delay': '120ms' }}>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">初稿编辑</span>
          <div className="flex items-center gap-3">
            {autoSaveHint && <span className="text-[11px] text-muted-foreground">{autoSaveHint}</span>}
            <span className="text-[11px] text-muted-foreground">编辑初稿后点击「确认终稿」</span>
          </div>
        </div>

        {/* Three-column layout */}
        <div className="flex flex-1 overflow-hidden enter" style={{ '--enter-delay': '180ms' }}>
          {/* Left: outline nav (read-only) */}
          <div className="hidden md:flex w-60 shrink-0 flex-col overflow-hidden border-r">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">大纲导航</span>
            </div>
            <ScrollArea className="flex-1 py-2">
              {outlineItems.map((item, idx) => (
                <OutlineTreeItem key={item.id} item={item} expanded={outlineExpanded} toggle={toggleOutline} index={idx} />
              ))}
            </ScrollArea>
          </div>

          {/* Center: draft editor */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Tabs value={editorTab} onValueChange={setEditorTab} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-1 border-b px-4">
                <TabsList className="h-auto bg-transparent p-0">
                  <TabsTrigger value="draft" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    初稿编辑
                  </TabsTrigger>
                  <TabsTrigger value="outline" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    大纲预览
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="draft" className="flex-1 overflow-hidden mt-0">
                <Textarea
                  ref={draftTextareaRef}
                  value={editDraft}
                  onChange={(e) => {
                    setEditDraft(e.target.value);
                    scheduleAutoSave('initial_draft', e.target.value);
                  }}
                  placeholder="初稿内容将在此处显示..."
                  className="h-full border-0 rounded-none resize-none font-mono text-[13px] leading-relaxed px-6 py-5 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </TabsContent>

              <TabsContent value="outline" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full">
                  <div className="px-8 py-6">
                    {outline ? (
                      <MarkdownRenderer content={outline} mode="outline" />
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无大纲内容</p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel */}
          <RightPanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            pipelineSteps={pipelineSteps}
            modifications={modifications}
            context={context}
            onRevert={handleRevert}
            articleId={id}
            draftContent={editDraft || draftText}
            segments={context?.segments || []}
            onInsertImage={insertImageToDraft}
          />
        </div>
      </div>
    );
  }

  /* =================================================================== */
  /* ===== PHASE: FINAL (status 4+) ===== */
  /* =================================================================== */
  return (
    <div className="flex h-screen flex-col">
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />

      {/* Top Bar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground " onClick={() => navigate('/articles')}>
            <ArrowLeft size={14} /> 返回
          </Button>
          <span className="text-[13px] text-muted-foreground/60">/</span>
          <span className="text-sm font-medium text-foreground">终稿预览</span>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 " onClick={() => setShowPreview(true)}>
            <Eye size={14} /> 预览
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleExportMarkdown}>
            <Download size={14} /> 导出
          </Button>
        </div>
      </div>

      {/* Pipeline strip */}
      {pipelineSteps.length > 0 && (
        <div className="shrink-0 border-b bg-muted/30 px-5 py-2 enter" style={{ '--enter-delay': '80ms' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent 工作流</span>
            <span className="text-[11px] text-muted-foreground">共 {pipelineSteps.length} 步</span>
          </div>
          <Pipeline steps={pipelineSteps} compact />
        </div>
      )}

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden enter" style={{ '--enter-delay': '160ms' }}>
        {/* Left: outline nav */}
        <div className="hidden md:flex w-60 shrink-0 flex-col overflow-hidden border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">大纲导航</span>
          </div>
          <ScrollArea className="flex-1 py-2">
            {outlineItems.map((item, idx) => (
              <OutlineTreeItem key={item.id} item={item} expanded={outlineExpanded} toggle={toggleOutline} index={idx} />
            ))}
          </ScrollArea>
        </div>

        {/* Center: rendered final article */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Tabs defaultValue="final" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b px-4">
              <TabsList className="h-auto bg-transparent p-0">
                <TabsTrigger value="final" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                  终稿
                </TabsTrigger>
                <TabsTrigger value="outline" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                  大纲
                </TabsTrigger>
                <TabsTrigger value="draft" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                  初稿
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="final" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-[65ch] px-8 py-6">
                  {(finalText || draftText) ? (
                    <MarkdownRenderer content={finalText || draftText} segments={context?.segments} />
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <Loader2 size={20} className="animate-spin mx-auto mb-3" />
                      <p className="text-sm">加载终稿内容中...</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="outline" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="px-8 py-6">
                  {outline ? (
                    <MarkdownRenderer content={outline} mode="outline" />
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无大纲内容</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="draft" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="px-8 py-6">
                  {draftText ? (
                    <MarkdownRenderer content={draftText} segments={context?.segments} />
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无初稿内容</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel */}
        <RightPanel
          rightTab={rightTab}
          setRightTab={setRightTab}
          pipelineSteps={pipelineSteps}
          modifications={modifications}
          context={context}
          onRevert={handleRevert}
          readonly
          articleId={id}
          draftContent={draftText || finalText}
          segments={context?.segments || []}
        />
      </div>

      {/* Preview Modal - portal to body for proper overlay and scrolling */}
      {showPreview && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="relative z-10 bg-background rounded-lg shadow-[var(--shadow-modal)] w-[90vw] max-w-[750px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold">{article?.title || '文章预览'}</h2>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowPreview(false)}>
                <X size={16} />
              </Button>
            </div>
            <ScrollArea className="h-[calc(85vh-48px)]">
              <div className="mx-auto max-w-[65ch] px-8 py-6">
                <MarkdownRenderer content={finalText || draftText} segments={context?.segments} />
              </div>
            </ScrollArea>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ===== Right Panel Component ===== */

function RightPanel({ rightTab, setRightTab, pipelineSteps, modifications, context, onRevert, readonly, articleId, draftContent, segments, onInsertImage }) {
  return (
    <div className="hidden lg:flex w-80 shrink-0 flex-col overflow-hidden border-l enter" style={{ '--enter-delay': '200ms' }}>
      <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start bg-transparent rounded-none p-0 px-1 gap-0">
            <TabsTrigger value="trace" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 text-xs">
              Agent 轨迹
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 text-xs">
              修改记录
            </TabsTrigger>
            <TabsTrigger value="context" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 text-xs">
              上下文
            </TabsTrigger>
            <TabsTrigger value="gallery" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 py-2 text-xs">
              配图
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Trace tab */}
        <TabsContent value="trace" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              {pipelineSteps.length > 0 ? (
                <Pipeline steps={pipelineSteps} />
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-[13px]">暂无 Agent 轨迹</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 p-4">
              {modifications.length > 0 ? modifications.map((mod, idx) => (
                <Card key={mod.id} className="bg-card border border-border enter-scale hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300" style={{ '--enter-delay': `${idx * 50}ms` }}>
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {mod.type === 'outline' ? '大纲' : mod.type === 'initial_draft' ? '初稿' : '终稿'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {OPERATION_LABELS[mod.operationType] || mod.operationType}
                        </span>
                      </div>
                      {!readonly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto gap-1 px-1.5 py-0.5 text-[10px] "
                          onClick={() => onRevert(mod.id)}
                        >
                          <RotateCcw size={10} /> 回退
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <Clock size={11} className="text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">{mod.time}</span>
                    </div>
                    {(mod.before || mod.after) && (
                      <div className="rounded-[var(--radius-sm)] bg-background p-2 font-mono text-[11px] leading-relaxed">
                        {mod.before && (
                          <div className="text-destructive mb-1">
                            <span className="opacity-60">- </span>{mod.before}
                          </div>
                        )}
                        {mod.after && (
                          <div className="text-[hsl(var(--success))]">
                            <span className="opacity-60">+ </span>{mod.after}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )) : (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-[13px]">暂无修改记录</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Context tab */}
        <TabsContent value="context" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              {context ? (
                <>
                  {context.entity && (
                    <div className="enter" style={{ '--enter-delay': '0ms' }}>
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">实体信息</div>
                      <Card className="bg-card border border-border hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300">
                        <CardContent className="p-3.5">
                          <div className="text-[13px] font-medium text-foreground mb-1">{context.entity.stdName}</div>
                          {context.entity.alias && <div className="text-[11px] text-muted-foreground">别名：{context.entity.alias}</div>}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  {(context.population || context.scene) && (
                    <div className="grid grid-cols-2 gap-2 enter" style={{ '--enter-delay': '60ms' }}>
                      {context.population && (
                        <Card className="bg-card border border-border hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300">
                          <CardContent className="p-3.5">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">目标人群</div>
                            <div className="text-[13px] font-medium text-foreground">{context.population.stdName}</div>
                          </CardContent>
                        </Card>
                      )}
                      {context.scene && (
                        <Card className="bg-card border border-border hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300">
                          <CardContent className="p-3.5">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">场景</div>
                            <div className="text-[13px] font-medium text-foreground">{context.scene.stdName}</div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                  {context.template && (
                    <div className="enter" style={{ '--enter-delay': '120ms' }}>
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">使用模板</div>
                      <Card className="bg-card border border-border hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300">
                        <CardContent className="p-3.5">
                          <div className="text-[13px] font-medium text-foreground mb-0.5">{context.template.templateName}</div>
                          <div className="text-[11px] text-muted-foreground">{context.template.purpose}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  {context.mustInclude && context.mustInclude.length > 0 && (
                    <div className="enter" style={{ '--enter-delay': '180ms' }}>
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">必须包含</div>
                      <div className="flex flex-col gap-1.5 px-1">
                        {context.mustInclude.map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground enter" style={{ '--enter-delay': `${200 + i * 30}ms` }}>
                            <CheckCircle2 size={12} className="shrink-0 text-[hsl(var(--success))]" />
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {context.mustNotSay && context.mustNotSay.length > 0 && (
                    <div className="enter" style={{ '--enter-delay': '240ms' }}>
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">禁止用语</div>
                      <div className="flex flex-col gap-1.5 px-1">
                        {context.mustNotSay.map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground enter" style={{ '--enter-delay': `${260 + i * 30}ms` }}>
                            <Badge variant="warning" className="text-[10px] px-1.5">禁</Badge>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {context.segments && context.segments.length > 0 && (
                    <div className="enter" style={{ '--enter-delay': '300ms' }}>
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">知识引用</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        引用的 {context.segments.length} 条知识片段已标注在文章正文中，将鼠标悬浮到绿色的「原文」标签上可查看来源。
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-[13px]">暂无上下文信息</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Gallery tab */}
        <TabsContent value="gallery" className="flex-1 overflow-hidden mt-0 h-full">
          <ImageGallery
            articleId={articleId}
            draftContent={draftContent}
            readonly={readonly}
            onInsertImage={onInsertImage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
