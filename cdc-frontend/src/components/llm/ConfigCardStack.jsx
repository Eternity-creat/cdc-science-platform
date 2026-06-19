import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Pencil, RotateCcw,
  Loader2, Check, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.jsx';
import { Badge } from '../ui/badge.jsx';
import { Input } from '../ui/input.jsx';
import { Textarea } from '../ui/textarea.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.jsx';
import { Separator } from '../ui/separator.jsx';
import { cn } from '../../lib/utils.js';
import * as llmApi from '../../api/llmConfig.js';

/* ── Constants ─────────────────────────────────────────── */

const MAX_VISIBLE_STACK = 3;

const PROVIDERS = [
  { value: 'dashscope', label: 'DashScope' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: '自定义' },
];

const emptyFormData = {
  configName: '',
  provider: 'dashscope',
  modelName: '',
  apiKeyEncrypted: '',
  baseUrl: '',
  params: '',
  description: '',
  isEnabled: 1,
};

/* ── Toggle Switch ─────────────────────────────────────── */

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
        checked ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--muted-foreground)/0.25)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

/* ── Config Edit Form (shared between edit & add) ──────── */

function ConfigForm({ formData, setFormData, onSubmit, submitLabel, submitting, onCancel }) {
  const onField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className="text-label">配置名称</label>
          <Input
            placeholder="例如：GPT-4o 文章生成配置"
            value={formData.configName}
            onChange={e => onField('configName', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-label">提供商</label>
          <Select value={formData.provider} onValueChange={v => onField('provider', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-label">
            模型名称 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <Input
            placeholder="qwen-max"
            value={formData.modelName}
            onChange={e => onField('modelName', e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-label">API Key</label>
          <Input
            type="password"
            placeholder="输入 API Key"
            value={formData.apiKeyEncrypted}
            onChange={e => onField('apiKeyEncrypted', e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-label">Base URL</label>
          <Input
            placeholder="可选，自定义 API 端点地址"
            value={formData.baseUrl}
            onChange={e => onField('baseUrl', e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-label">模型参数</label>
          <Textarea
            placeholder='{"temperature": 0.7, "max_tokens": 2048}'
            value={formData.params}
            onChange={e => onField('params', e.target.value)}
            rows={2}
            className="font-mono text-xs"
          />
          <p className="text-micro text-muted-foreground">JSON 格式，可选</p>
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-label">描述</label>
          <Input
            placeholder="配置说明，便于区分"
            value={formData.description}
            onChange={e => onField('description', e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-label">状态</span>
          <ToggleSwitch
            checked={Number(formData.isEnabled) === 1}
            onChange={v => onField('isEnabled', v ? 1 : 0)}
          />
          <span className="text-helper text-muted-foreground">
            {Number(formData.isEnabled) === 1 ? '启用' : '禁用'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5 min-w-[80px]"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */

export default function ConfigCardStack({
  open,
  onOpenChange,
  configs: propConfigs = [],
  configType,
  typeLabel,
  typeDesc,
  onRefresh,
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewMode, setViewMode] = useState('front'); // 'front' | 'edit' | 'add'
  const [formData, setFormData] = useState({ ...emptyFormData });
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [slideDir, setSlideDir] = useState(null);

  // Always use propConfigs directly — single source of truth from parent
  const configs = propConfigs;
  const current = configs[activeIdx] || null;

  // Reset state when dialog opens or configType changes
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setViewMode('front');
      setConfirmDeleteId(null);
      setSlideDir(null);
    }
  }, [open, configType]);

  // Clamp activeIdx when configs change
  useEffect(() => {
    if (activeIdx >= configs.length) {
      setActiveIdx(Math.max(0, configs.length - 1));
    }
  }, [configs.length, activeIdx]);

  /* ── Navigation ── */
  const goTo = useCallback((idx) => {
    setSlideDir(idx > activeIdx ? 'left' : 'right');
    setViewMode('front');
    setConfirmDeleteId(null);
    setTimeout(() => {
      setActiveIdx(idx);
      setSlideDir(null);
    }, 180);
  }, [activeIdx]);

  /* ── Edit mode ── */
  const enterEdit = useCallback(() => {
    if (!current) return;
    setFormData({
      configName: current.configName || '',
      provider: current.provider || 'dashscope',
      modelName: current.modelName || '',
      apiKeyEncrypted: current.apiKeyEncrypted || '',
      baseUrl: current.baseUrl || '',
      params: current.params || '',
      description: current.description || '',
      isEnabled: current.isEnabled ?? 1,
    });
    setViewMode('edit');
  }, [current]);

  /* ── API: Toggle enable ── */
  const handleToggle = useCallback(async (cfg) => {
    setTogglingId(cfg.id);
    try {
      const nextEnabled = cfg.isEnabled ? 0 : 1;
      await llmApi.updateConfig(cfg.id, { ...cfg, isEnabled: nextEnabled });
      onRefresh?.();
      toast.success(nextEnabled ? '已启用' : '已禁用');
    } catch {
      toast.error('切换状态失败');
    } finally {
      setTogglingId(null);
    }
  }, [onRefresh]);

  /* ── API: Save edit ── */
  const handleSave = useCallback(async () => {
    if (!formData.modelName.trim()) { toast.error('模型名称不能为空'); return; }
    setSubmitting(true);
    try {
      await llmApi.updateConfig(current.id, {
        ...formData,
        configType,
        isEnabled: Number(formData.isEnabled),
      });
      setViewMode('front');
      onRefresh?.();
      toast.success('配置已更新');
    } catch (e) {
      toast.error('保存失败: ' + (e.message || ''));
    } finally {
      setSubmitting(false);
    }
  }, [formData, current, configType, onRefresh]);

  /* ── API: Add new ── */
  const handleAdd = useCallback(async () => {
    if (!formData.modelName.trim()) { toast.error('模型名称不能为空'); return; }
    setSubmitting(true);
    try {
      await llmApi.addConfig({
        ...formData,
        configType,
        isDefault: configs.length === 0 ? 1 : 0,
        isEnabled: Number(formData.isEnabled),
      });
      setViewMode('front');
      setFormData({ ...emptyFormData });
      onRefresh?.();
      toast.success('配置已创建');
    } catch (e) {
      toast.error('创建失败: ' + (e.message || ''));
    } finally {
      setSubmitting(false);
    }
  }, [formData, configType, configs.length, onRefresh]);

  /* ── API: Delete (inline confirm) ── */
  const handleDelete = useCallback(async (id) => {
    setDeleting(true);
    try {
      await llmApi.deleteConfig(id);
      setConfirmDeleteId(null);
      onRefresh?.();
      toast.success('配置已删除');
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  }, [onRefresh]);

  /* ── Stack visual ── */
  const visibleStack = configs.slice(activeIdx, activeIdx + MAX_VISIBLE_STACK);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-section-title">
            {typeLabel}
            <Badge variant="secondary" className="text-[11px] font-normal">
              {configs.length} 个配置
            </Badge>
          </DialogTitle>
          <DialogDescription>{typeDesc}</DialogDescription>
        </DialogHeader>

        {/* ── Empty state ── */}
        {configs.length === 0 && viewMode !== 'add' && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-14 h-14 rounded-xl bg-[hsl(var(--accent))] flex items-center justify-center mb-4">
              <AlertCircle size={22} className="text-muted-foreground" />
            </div>
            <p className="text-body text-muted-foreground mb-4">暂无配置，点击下方按钮创建第一个模型配置</p>
            <Button onClick={() => { setViewMode('add'); setFormData({ ...emptyFormData, configName: `${typeLabel}配置` }); }}>
              <Plus size={14} className="mr-1.5" /> 新增配置
            </Button>
          </div>
        )}

        {/* ── Card stack (front view) ── */}
        {configs.length > 0 && viewMode === 'front' && (
          <div className="py-1">
            <div className="card-stack-viewport">
              <div className="card-stack-container">
                {visibleStack.map((cfg, stackIdx) => {
                  const isTop = stackIdx === 0;
                  const stackOffset = stackIdx * 10;
                  const stackScale = 1 - stackIdx * 0.03;
                  const stackOpacity = 1 - stackIdx * 0.35;
                  const isConfirmingDelete = confirmDeleteId === cfg.id;

                  return (
                    <div
                      key={cfg.id || stackIdx}
                      className={cn(
                        'card-stack-item',
                        isTop && 'card-stack-top',
                        slideDir && isTop && `card-slide-${slideDir}`
                      )}
                      style={{
                        zIndex: MAX_VISIBLE_STACK - stackIdx,
                        transform: isTop
                          ? undefined
                          : `translateY(${stackOffset}px) scale(${stackScale})`,
                        opacity: isTop ? 1 : stackOpacity,
                      }}
                    >
                      {/* ── Card face ── */}
                      <div
                        className={cn(
                          'rounded-xl border bg-[hsl(var(--card))] p-5',
                          isTop
                            ? 'shadow-[var(--shadow-elevated)] cursor-pointer hover:shadow-[var(--shadow-modal)] transition-shadow duration-200'
                            : 'shadow-[var(--shadow-card)]'
                        )}
                        onClick={isTop ? enterEdit : undefined}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-base font-semibold leading-tight flex-1 min-w-0 truncate">
                            {cfg.configName}
                          </h3>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {togglingId === cfg.id && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                            <ToggleSwitch
                              checked={!!cfg.isEnabled}
                              onChange={() => handleToggle(cfg)}
                              disabled={togglingId === cfg.id}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <Badge variant="outline" className="text-xs font-mono">
                            {cfg.modelName}
                          </Badge>
                          <Badge variant="secondary" className="text-[11px]">
                            {cfg.provider}
                          </Badge>
                          {cfg.isEnabled ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--success))] font-medium pulse-enabled">
                              <Check size={11} /> 已启用
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground font-medium">已禁用</span>
                          )}
                        </div>

                        {cfg.baseUrl && (
                          <p className="text-helper text-muted-foreground font-mono truncate mb-1.5">
                            {cfg.baseUrl}
                          </p>
                        )}
                        {cfg.description && (
                          <p className="text-helper text-muted-foreground line-clamp-2 mb-1">
                            {cfg.description}
                          </p>
                        )}
                        {cfg.params && (
                          <p className="text-micro text-muted-foreground font-mono mt-2 truncate opacity-70">
                            {cfg.params}
                          </p>
                        )}

                        {isTop && (
                          <>
                            <Separator className="my-3" />
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 gap-1"
                                onClick={(e) => { e.stopPropagation(); enterEdit(); }}
                              >
                                <Pencil size={12} /> 编辑
                              </Button>

                              {isConfirmingDelete ? (
                                <span className="flex items-center gap-1.5 ml-1">
                                  <span className="text-xs text-[hsl(var(--destructive))]">确定删除？</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7 gap-1 text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(cfg.id); }}
                                    disabled={deleting}
                                  >
                                    {deleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                    确认
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                  >
                                    取消
                                  </Button>
                                </span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7 gap-1 text-[hsl(var(--destructive))]"
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(cfg.id); }}
                                >
                                  <Trash2 size={12} /> 删除
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Navigation dots ── */}
            {configs.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={activeIdx === 0}
                  onClick={() => goTo(activeIdx - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                {configs.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all duration-200',
                      idx === activeIdx
                        ? 'bg-primary scale-125'
                        : 'bg-[hsl(var(--border))] hover:bg-[hsl(var(--muted-foreground)/0.4)]'
                    )}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={activeIdx >= configs.length - 1}
                  onClick={() => goTo(activeIdx + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Edit view ── */}
        {viewMode === 'edit' && current && (
          <div className="py-1 card-view-enter">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section-title">编辑配置</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setViewMode('front')}
              >
                <RotateCcw size={13} /> 返回卡片
              </Button>
            </div>
            <ConfigForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSave}
              submitLabel="保存修改"
              submitting={submitting}
              onCancel={() => setViewMode('front')}
            />
          </div>
        )}

        {/* ── Add view ── */}
        {viewMode === 'add' && (
          <div className="py-1 card-view-enter">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section-title">新增配置</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => { setViewMode(configs.length > 0 ? 'front' : 'front'); setFormData({ ...emptyFormData }); }}
              >
                <RotateCcw size={13} /> 取消
              </Button>
            </div>
            <ConfigForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleAdd}
              submitLabel="创建配置"
              submitting={submitting}
              onCancel={() => { setViewMode(configs.length > 0 ? 'front' : 'front'); setFormData({ ...emptyFormData }); }}
            />
          </div>
        )}

        {/* ── Bottom bar ── */}
        {viewMode === 'front' && (
          <DialogFooter className="sm:justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => { setViewMode('add'); setFormData({ ...emptyFormData, configName: `${typeLabel}配置` }); }}
            >
              <Plus size={14} /> 新增配置
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
