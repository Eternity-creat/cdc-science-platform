import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { diffLines, diffWordsWithSpace } from 'diff';
import {
  ChevronRight, ChevronDown, Save, Wand2, FileCheck2, Clock,
  ArrowLeft, Download, Eye, Loader2, Sparkles, CheckCircle2,
  RefreshCw, RotateCcw, AlertTriangle, X, List, Search
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
import OutlineNavigator from '../components/OutlineNavigator.jsx';
import { buildImageMarkdown, insertMarkdownAtSuggestedSection } from '../lib/content.js';
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

function getGenerationErrorDescription(error) {
  const message = String(error?.message || error || '');
  if (/API Key|api key|invalid_api_key|401|403|Forbidden/i.test(message)) {
    return '文本生成模型认证失败。请到「LLM 配置」里的「文章生成」配置，更新有效 API Key；如果使用工作空间 key，请同时填写匹配的 Base URL。';
  }
  return message || '请重试';
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
    before: normalizeModificationContent(m.beforeContent || ''),
    after: normalizeModificationContent(m.afterContent || ''),
    previewBefore: makeContentPreview(m.beforeContent || ''),
    previewAfter: makeContentPreview(m.afterContent || ''),
    summary: summarizeModification(m.beforeContent || '', m.afterContent || ''),
  }));
}

function normalizeModificationContent(content) {
  let value = String(content || '');
  for (let i = 0; i < 6; i += 1) {
    const trimmed = value.trim();
    if (!(trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"'))) break;
    if (trimmed.startsWith('"#') || trimmed.startsWith('"##')) {
      value = trimmed.slice(1, -1);
      continue;
    }
    try {
      const decoded = JSON.parse(trimmed);
      if (typeof decoded !== 'string') break;
      value = decoded;
    } catch {
      const inner = trimmed.slice(1, -1);
      if (!inner.includes('\\n') && !inner.includes('\\"') && !inner.includes('\\\\')) break;
      value = inner
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }
  value = value.replace(/\r\n/g, '\n');
  if (value.includes('\\n') && !value.includes('\n')) {
    value = value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }
  return value;
}

function makeContentPreview(content, max = 90) {
  const text = normalizeModificationContent(content).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function summarizeModification(before = '', after = '') {
  const beforeText = normalizeModificationContent(before);
  const afterText = normalizeModificationContent(after);
  const changes = buildModificationDiff(beforeText, afterText);
  return {
    beforeChars: beforeText.length,
    afterChars: afterText.length,
    deltaChars: afterText.length - beforeText.length,
    beforeLines: beforeText ? beforeText.split('\n').length : 0,
    afterLines: afterText ? afterText.split('\n').length : 0,
    removedLines: changes.deletions,
    addedLines: changes.insertions,
    replacements: changes.replacements,
    changedParts: changes.total,
  };
}

function buildModificationDiff(before = '', after = '') {
  const parts = diffWordsWithSpace(before, after);
  const changes = [];
  let index = 0;

  while (index < parts.length) {
    if (!parts[index].removed && !parts[index].added) {
      index += 1;
      continue;
    }

    let removed = '';
    let added = '';
    while (index < parts.length && (parts[index].removed || parts[index].added)) {
      if (parts[index].removed) removed += parts[index].value;
      if (parts[index].added) added += parts[index].value;
      index += 1;
    }

    const beforeValue = removed.trim();
    const afterValue = added.trim();
    if (!beforeValue && !afterValue) continue;
    changes.push({
      kind: beforeValue && afterValue ? 'replacement' : beforeValue ? 'deletion' : 'insertion',
      before: beforeValue,
      after: afterValue,
    });
  }

  return {
    changes,
    replacements: changes.filter(change => change.kind === 'replacement').length,
    deletions: changes.filter(change => change.kind === 'deletion').length,
    insertions: changes.filter(change => change.kind === 'insertion').length,
    total: changes.length,
  };
}

function buildContextChanges(before = '', after = '') {
  const parts = diffLines(before, after);
  const changes = [];
  let index = 0;

  while (index < parts.length) {
    if (!parts[index].removed && !parts[index].added) {
      index += 1;
      continue;
    }

    let removed = '';
    let added = '';
    while (index < parts.length && (parts[index].removed || parts[index].added)) {
      if (parts[index].removed) removed += parts[index].value;
      if (parts[index].added) added += parts[index].value;
      index += 1;
    }

    if (removed.trim() || added.trim()) {
      changes.push({
        kind: removed.trim() && added.trim() ? 'replacement' : removed.trim() ? 'deletion' : 'insertion',
        before: removed.trim(),
        after: added.trim(),
      });
    }
  }

  return changes;
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
    <div className="fixed inset-0 z-[140] flex items-center justify-center">
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
  const [showOutlineTree, setShowOutlineTree] = useState(true);
  const [streamingText, setStreamingText] = useState('');

  /* Refs for auto-save */
  const autoSaveTimer = useRef(null);
  const autoSavePromise = useRef(null);
  const lastAutoSaveField = useRef(null);
  const draftTextareaRef = useRef(null);
  const draftPreviewScrollRef = useRef(null);
  const finalPreviewScrollRef = useRef(null);
  const modalPreviewScrollRef = useRef(null);

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
        toast.error('加载文章失败', { description: e.message || '请刷新页面重试' });
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
      autoSaveTimer.current = null;
      const request = articleApi.autoSave(id, field, content);
      autoSavePromise.current = request;
      try {
        await request;
        setAutoSavedAt(new Date());
      } catch (e) {
        console.error('自动保存失败:', e);
      } finally {
        if (autoSavePromise.current === request) autoSavePromise.current = null;
      }
    }, 3000);
  }, [id]);

  const flushAutoSaveBeforeManualSave = useCallback(async () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    if (autoSavePromise.current) {
      await autoSavePromise.current.catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  /* ===== Action handlers ===== */

  const runStreamedGeneration = useCallback(async (label, request, onStreamText) => {
    setGenerating(true);
    setGeneratingLabel(label);
    setStreamingText('');
    try {
      return await request({
        onChunk: async (text) => {
          setStreamingText(text);
          onStreamText?.(text);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        },
      });
    } finally {
      setGenerating(false);
      setGeneratingLabel('');
      setStreamingText('');
    }
  }, []);

  const handleGenerateOutline = async () => {
    setGenerating(true);
    setGeneratingLabel('正在生成大纲');
    setEditOutline('');
    setOutlineItems([]);
    try {
      const result = await runStreamedGeneration('正在生成大纲', (options) =>
        articleApi.generateOutlineStream(id, options),
        (text) => {
          setEditOutline(text);
          setOutlineItems(parseOutlineToTree(text));
        }
      );
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
      toast.error('生成大纲失败', { description: getGenerationErrorDescription(e) });
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
        setEditOutline('');
        setOutlineItems([]);
        try {
          const result = await runStreamedGeneration('正在重新生成大纲', (options) =>
            articleApi.regenerateOutlineStream(id, options),
            (text) => {
              setEditOutline(text);
              setOutlineItems(parseOutlineToTree(text));
            }
          );
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
          toast.error('重新生成大纲失败', { description: getGenerationErrorDescription(e) });
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
      await flushAutoSaveBeforeManualSave();
      await articleApi.saveOutline(id, editOutline);
      setOutline(editOutline);
      setOutlineItems(parseOutlineToTree(editOutline));
      const mods = await articleApi.getModifications(id).catch(() => []);
      setModifications(parseModifications(mods));
      toast.success('大纲已保存');
    } catch (e) {
      console.error('保存大纲失败:', e);
      toast.error('保存失败', { description: e.message || '请检查网络连接后重试' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOutlineAndGenerateDraft = async () => {
    // First save outline if changed
    try {
      if (editOutline !== outline) {
        await flushAutoSaveBeforeManualSave();
        await articleApi.confirmOutline(id, editOutline);
        setOutline(editOutline);
        setOutlineItems(parseOutlineToTree(editOutline));
      }
    } catch (e) {
      console.error('确认大纲失败:', e);
      toast.error('确认大纲失败', { description: e.message || '请重试' });
      return;
    }
    // Then generate draft
    setGenerating(true);
    setGeneratingLabel('正在生成初稿');
    setDraftText('');
    setEditDraft('');
    setEditorTab('preview');
    setArticle(prev => prev ? { ...prev, status: 3, initialDraft: '' } : prev);
    try {
      const result = await runStreamedGeneration('正在生成初稿', (options) =>
        articleApi.generateDraftStream(id, options),
        (text) => {
          setDraftText(text);
          setEditDraft(text);
        }
      );
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
      toast.error('生成初稿失败', { description: getGenerationErrorDescription(e) });
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
        setDraftText('');
        setEditDraft('');
        setEditorTab('preview');
        try {
          const result = await runStreamedGeneration('正在重新生成初稿', (options) =>
            articleApi.regenerateDraftStream(id, options),
            (text) => {
              setDraftText(text);
              setEditDraft(text);
            }
          );
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
          toast.error('重新生成初稿失败', { description: getGenerationErrorDescription(e) });
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
      await flushAutoSaveBeforeManualSave();
      await articleApi.saveDraft(id, editDraft);
      setDraftText(editDraft);
      const mods = await articleApi.getModifications(id).catch(() => []);
      setModifications(parseModifications(mods));
      toast.success('初稿已保存');
    } catch (e) {
      console.error('保存初稿失败:', e);
      toast.error('保存失败', { description: e.message || '请检查网络连接后重试' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = async () => {
    // Save draft if changed
    try {
      if (editDraft !== draftText) {
        await flushAutoSaveBeforeManualSave();
        await articleApi.saveDraft(id, editDraft);
        setDraftText(editDraft);
      }
    } catch (e) {
      console.error('保存初稿失败:', e);
      toast.error('保存初稿失败', { description: e.message || '请重试' });
      return;
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
      toast.success('终稿已确认');
    } catch (e) {
      console.error('确认终稿失败:', e);
      toast.error('确认终稿失败', { description: e.message || '请重试' });
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
          await flushAutoSaveBeforeManualSave();
          const reverted = await articleApi.revertToModification(id, modificationId);
          if (!reverted) throw new Error('回退未完成，请刷新后重试');
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
          toast.success('已回退到历史版本');
        } catch (e) {
          console.error('回退失败:', e);
          toast.error('回退失败', { description: e.message || '请重试' });
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
  const insertImageToDraft = useCallback((img, options = {}) => {
    if (!img?.filePath) return;
    const markdown = buildImageMarkdown(img, options);
    if (options.insertAt === 'section') {
      const inserted = insertMarkdownAtSuggestedSection(editDraft, markdown, img);
      if (inserted.matched) {
        setEditDraft(inserted.content);
        scheduleAutoSave('initial_draft', inserted.content);
        toast.success('已插入到对应段落', { description: inserted.targetTitle });
        return;
      }
    }
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

  /* =================================================================== */
  /* ===== PHASE: OUTLINE (status 1-2) ===== */
  /* =================================================================== */
  if (phase === 'outline') {
    const hasOutline = !!outline;
    return (
      <div className="flex h-screen flex-col">
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />

        {/* Top Bar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter flex-wrap gap-y-2">
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
              <Button size="sm" className="gap-1.5 " onClick={handleGenerateOutline} disabled={generating}>
                <Wand2 size={14} /> <span className="hidden sm:inline">AI 生成大纲</span>
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 " onClick={handleRegenerateOutline} disabled={generating}>
                  <RefreshCw size={14} /> <span className="hidden sm:inline">重新生成</span>
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleSaveOutline} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span className="hidden sm:inline">保存</span>
                </Button>
                <Button size="sm" className="gap-1.5 " onClick={handleConfirmOutlineAndGenerateDraft} disabled={generating}>
                  <Sparkles size={14} /> <span className="hidden md:inline">确认大纲并生成初稿</span>
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

        {generating && (
          <GenerationStrip
            label={generatingLabel}
            length={editOutline.length}
            type="outline"
          />
        )}

        {/* Two-panel layout */}
        <div className="flex flex-1 overflow-hidden enter" style={{ '--enter-delay': '120ms' }}>
          {/* Mobile toggle for outline tree */}
          <button
            className="md:hidden shrink-0 p-2 border-r hover:bg-accent/50 transition-colors self-start mt-2 ml-1 rounded-md"
            onClick={() => setShowOutlineTree(!showOutlineTree)}
            title={showOutlineTree ? '隐藏大纲树' : '显示大纲树'}
          >
            <List size={16} className="text-muted-foreground" />
          </button>
          {/* Left: outline tree */}
          <div className={cn(
            "shrink-0 border-r overflow-hidden",
            showOutlineTree ? "flex" : "hidden",
            "md:flex w-full md:w-[280px]"
          )}>
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
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter flex-wrap gap-y-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground " onClick={() => navigate('/articles')}>
              <ArrowLeft size={14} /> 返回
            </Button>
            <span className="text-[13px] text-muted-foreground/60">/</span>
            <span className="text-sm font-medium text-foreground">文章初稿</span>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 " onClick={handleRegenerateDraft} disabled={generating}>
              <RefreshCw size={14} /> <span className="hidden sm:inline">重新生成<span className="hidden md:inline">初稿</span></span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleSaveDraft} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <span className="hidden sm:inline">保存</span>
            </Button>
            <Button size="sm" className="gap-1.5 " onClick={handleConfirmDraft}>
              <FileCheck2 size={14} /> <span className="hidden sm:inline">确认终稿</span>
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

        {generating && (
          <GenerationStrip
            label={generatingLabel}
            length={(editDraft || draftText).length}
            type="draft"
          />
        )}

        {/* Three-column layout */}
        <div className="flex flex-1 overflow-hidden enter" style={{ '--enter-delay': '180ms' }}>
          <OutlineNavigator
            className="hidden md:flex w-60 shrink-0"
            content={editDraft || draftText || outline}
            scrollRootRef={draftPreviewScrollRef}
            title="文章目录"
          />

          {/* Center: draft editor */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Tabs value={editorTab} onValueChange={setEditorTab} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-1 border-b px-4">
                <TabsList className="h-auto bg-transparent p-0">
                  <TabsTrigger value="draft" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    初稿编辑
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                    初稿预览
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

              <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
                <ScrollArea ref={draftPreviewScrollRef} className="h-full">
                  <div className="mx-auto max-w-[72ch] px-8 py-6">
                    {editDraft || draftText ? (
                      <MarkdownRenderer
                        key={context?.segments ? 'has-segments' : 'no-segments'}
                        content={editDraft || draftText}
                        segments={context?.segments}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无初稿内容</p>
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
      <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-2.5 enter flex-wrap gap-y-2">
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
            <Eye size={14} /> <span className="hidden sm:inline">预览</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 " onClick={handleExportMarkdown}>
            <Download size={14} /> <span className="hidden sm:inline">导出</span>
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
        <OutlineNavigator
          className="hidden md:flex w-60 shrink-0"
          content={finalText || draftText || outline}
          scrollRootRef={finalPreviewScrollRef}
          title="文章目录"
        />

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
              <ScrollArea ref={finalPreviewScrollRef} className="h-full">
                <div className="mx-auto max-w-[65ch] px-8 py-6">
                  {(finalText || draftText) ? (
                    <MarkdownRenderer
                      key={context?.segments ? 'has-segments' : 'no-segments'}
                      content={finalText || draftText}
                      segments={context?.segments}
                    />
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
            <ScrollArea ref={modalPreviewScrollRef} className="h-[calc(85vh-48px)]">
              <div className="mx-auto max-w-[65ch] px-8 py-6">
                <MarkdownRenderer
                  key={context?.segments ? 'has-segments' : 'no-segments'}
                  content={finalText || draftText}
                  segments={context?.segments}
                />
              </div>
            </ScrollArea>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function GenerationStrip({ label, length, type }) {
  const name = type === 'draft' ? '初稿' : '大纲';

  return (
    <div className="shrink-0 border-b bg-primary/5 px-5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles size={15} className="animate-pulse" />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{label || `正在生成${name}`}</div>
            <div className="text-[11px] text-muted-foreground">
              SSE 流式输出中，内容会直接写入{name}编辑区
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{length || 0} 字</span>
          <Loader2 size={14} className="animate-spin text-primary" />
        </div>
      </div>
    </div>
  );
}

/* ===== Right Panel Component ===== */

function ModificationCard({ mod, index, readonly, onRevert, onOpen }) {
  const diff = buildModificationDiff(mod.before, mod.after);
  const changes = diff.changes.slice(0, 3);
  const delta = mod.summary?.deltaChars || 0;

  return (
    <Card className="bg-card border border-border enter-scale hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300" style={{ '--enter-delay': `${index * 50}ms` }}>
      <CardContent className="p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {mod.type === 'outline' ? '大纲' : mod.type === 'initial_draft' ? '初稿' : '终稿'}
            </Badge>
            <span className="truncate text-[10px] text-muted-foreground">
              {OPERATION_LABELS[mod.operationType] || mod.operationType}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1 px-1.5 py-0.5 text-[10px]"
            onClick={() => onOpen(mod)}
          >
            <Search size={10} /> 详情
          </Button>
        </div>

        <div className="mb-2 flex items-center gap-1">
          <Clock size={11} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">{mod.time}</span>
        </div>

        <div className="mb-2 grid grid-cols-3 gap-1 text-center text-[10px]">
          <div className="rounded bg-muted/50 px-1.5 py-1">
            <div className="font-medium text-foreground">{mod.summary.changedParts}</div>
            <div className="text-muted-foreground">变更处</div>
          </div>
          <div className="rounded bg-muted/50 px-1.5 py-1">
            <div className="font-medium text-destructive">{mod.summary.removedLines}</div>
            <div className="text-muted-foreground">删除处</div>
          </div>
          <div className="rounded bg-muted/50 px-1.5 py-1">
            <div className={cn('font-medium', delta < 0 ? 'text-destructive' : delta > 0 ? 'text-[hsl(var(--success))]' : 'text-foreground')}>
              {delta > 0 ? `+${delta}` : delta}
            </div>
            <div className="text-muted-foreground">字符</div>
          </div>
        </div>

        {changes.length > 0 ? (
          <div className="rounded-[var(--radius-sm)] bg-background p-2 font-mono text-[11px] leading-relaxed">
            {changes.map((change, i) => (
              <div key={`change-${i}`} className="mb-1 last:mb-0">
                {change.before && <div className="text-destructive"><span className="opacity-60">- </span>{makeContentPreview(change.before, 64)}</div>}
                {change.after && <div className="text-[hsl(var(--success))]"><span className="opacity-60">+ </span>{makeContentPreview(change.after, 64)}</div>}
              </div>
            ))}
            {diff.changes.length > changes.length && <div className="text-muted-foreground">还有 {diff.changes.length - changes.length} 处变更...</div>}
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] bg-background p-2 text-[11px] text-muted-foreground">
            {mod.previewAfter || mod.previewBefore || '暂无可预览内容'}
          </div>
        )}

        {!readonly && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-1.5 py-0.5 text-[10px]"
              onClick={() => onRevert(mod.id)}
            >
              <RotateCcw size={10} /> 回退到修改前
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModificationDetailModal({ mod, readonly, onClose, onRevert }) {
  const diff = buildModificationDiff(mod.before, mod.after);
  const contextChanges = buildContextChanges(mod.before, mod.after);
  const fullDiff = diffWordsWithSpace(mod.before, mod.after);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[86vh] w-[92vw] max-w-[980px] flex-col overflow-hidden rounded-lg bg-background shadow-[var(--shadow-modal)]">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {mod.type === 'outline' ? '大纲' : mod.type === 'initial_draft' ? '初稿' : '终稿'}
              </Badge>
              <span className="text-sm font-semibold">{OPERATION_LABELS[mod.operationType] || mod.operationType}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock size={11} /> {mod.time}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-base font-semibold">{mod.summary.changedParts}</div>
                <div className="text-muted-foreground">变更处</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-base font-semibold text-destructive">{mod.summary.removedLines}</div>
                <div className="text-muted-foreground">删除处</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-base font-semibold">{mod.summary.deltaChars > 0 ? `+${mod.summary.deltaChars}` : mod.summary.deltaChars}</div>
                <div className="text-muted-foreground">字符变化</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">关键变更</div>
              <DiffList title="完整变更段落" changes={contextChanges} />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">完整内容对比</div>
              <div className="grid gap-3 md:grid-cols-2">
                <FullContentBlock title="修改前" parts={fullDiff} side="before" />
                <FullContentBlock title="修改后" parts={fullDiff} side="after" />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          {!readonly && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                onClose();
                onRevert(mod.id);
              }}
            >
              <RotateCcw size={13} /> 回退到修改前
            </Button>
          )}
          <Button size="sm" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DiffList({ title, changes }) {
  return (
    <div className="rounded-md border bg-background">
      <div className="border-b px-3 py-2 text-xs font-medium">{title}</div>
      <div className="max-h-52 overflow-auto p-3">
        {changes.length > 0 ? changes.map((change, i) => (
          <div key={i} className="mb-3 font-mono text-[11px] leading-relaxed last:mb-0">
            {change.before && <div className="text-destructive"><span className="opacity-60">- </span>{change.before}</div>}
            {change.after && <div className="text-[hsl(var(--success))]"><span className="opacity-60">+ </span>{change.after}</div>}
          </div>
        )) : (
          <div className="text-[12px] text-muted-foreground">无</div>
        )}
      </div>
    </div>
  );
}

function FullContentBlock({ title, parts, side }) {
  return (
    <div className="rounded-md border bg-background">
      <div className="border-b px-3 py-2 text-xs font-medium">{title}</div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {parts.length > 0 ? parts.map((part, index) => {
          if (side === 'before' && part.added) return null;
          if (side === 'after' && part.removed) return null;
          const changed = side === 'before' ? part.removed : part.added;
          return (
            <span
              key={index}
              className={changed ? (side === 'before' ? 'bg-destructive/15 text-destructive' : 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]') : undefined}
            >
              {part.value}
            </span>
          );
        }) : '无内容'}
      </pre>
    </div>
  );
}

function RightPanel({ rightTab, setRightTab, pipelineSteps, modifications, context, onRevert, readonly, articleId, draftContent, segments, onInsertImage }) {
  const [selectedMod, setSelectedMod] = useState(null);

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
                <ModificationCard
                  key={mod.id}
                  mod={mod}
                  index={idx}
                  readonly={readonly}
                  onRevert={onRevert}
                  onOpen={setSelectedMod}
                />
              )) : (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-[13px]">暂无修改记录</p>
                </div>
              )}
            </div>
          </ScrollArea>
          {selectedMod && (
            <ModificationDetailModal
              mod={selectedMod}
              readonly={readonly}
              onClose={() => setSelectedMod(null)}
              onRevert={onRevert}
            />
          )}
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
